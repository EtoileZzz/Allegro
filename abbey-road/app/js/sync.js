/**
 * Allegro · 云端同步（客户端）
 *
 * 设计目标：**本地永远权威**。同步失败、口令错、没网，都不影响本地保存。
 *
 * 一次同步：
 *   ① GET /state            → { rev, envelope }
 *   ② 解密 envelope          → 远端状态（口令错就停在这里，绝不上传）
 *   ③ AR.Store.applyMerge    → 现成的记录级 LWW（打卡并集 / 墓碑按时间 / 冲突存副本）
 *   ④ 加密本机状态           → PUT /state, If-Match: rev
 *   ⑤ 409 → 服务端把最新密文一起返回了，拿它回到 ③ 再来一轮（最多 3 轮）
 *
 * 加密：AES-256-GCM + PBKDF2-SHA256(310k)，salt/IV 每次都随机，AAD 绑版本号。
 *       派生出的 CryptoKey 不可导出，服务端只见密文。
 *
 * 注意：本文件用到的 crypto.subtle 只在安全上下文可用 —— App 两端都以
 *       https://abbeyroad.local 载入，满足条件；若哪天改成 http/file，会直接不可用。
 */
(function (AR) {
  'use strict';

  var CFG_KEY = 'allegro.sync.cfg.v1';
  var PASS_KEY = 'allegro.sync.pass.v1';
  var RUN_KEY = 'allegro.sync.state.v1';

  var ITER = 310000;
  var ENVELOPE_V = 1;
  var AAD_PREFIX = 'ARS1|';
  var PUSH_RETRIES = 3;
  var NET_TIMEOUT = 12000;
  var DEBOUNCE_MS = 30000;     // 「打开时/定时」模式的改动去抖
  var DEBOUNCE_FAST_MS = 1500; // 「每次改动后同步」模式的去抖（几乎立即）
  var OPEN_GAP_MS = 2000;      // 刚同步过就不重复同步
  var MAX_ENVELOPE = 1500000;  // 超过就别传了（正常状态只有几十 KB）

  /* ─────────────── 小工具 ─────────────── */

  function bytesToB64(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i++) { s += String.fromCharCode(u8[i]); }
    return btoa(s);
  }
  function b64ToBytes(b64) {
    var raw = atob(b64);
    var u8 = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) { u8[i] = raw.charCodeAt(i); }
    return u8;
  }
  function randBytes(n) {
    var u8 = new Uint8Array(n);
    crypto.getRandomValues(u8);
    return u8;
  }
  function nowMs() { return Date.now(); }
  function enc(s) { return new TextEncoder().encode(s); }
  function dec(buf) { return new TextDecoder().decode(buf); }

  function readJSON(key, dflt) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) { return dflt; }
      var v = JSON.parse(raw);
      return v == null ? dflt : v;
    } catch (e) { return dflt; }
  }
  function writeJSON(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; }
  }

  /* ─────────────── 加解密 ─────────────── */

  function subtle() {
    if (!(typeof crypto !== 'undefined' && crypto.subtle)) {
      throw new Error('当前环境不支持加密（需要 https 安全上下文）');
    }
    return crypto.subtle;
  }

  /** PBKDF2 → AES-256-GCM 密钥（不可导出） */
  function deriveKey(pass, saltBytes, iter) {
    var sb = subtle();
    return sb.importKey('raw', enc(pass), { name: 'PBKDF2' }, false, ['deriveKey'])
      .then(function (base) {
        return sb.deriveKey(
          { name: 'PBKDF2', salt: saltBytes, iterations: iter || ITER, hash: 'SHA-256' },
          base,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      });
  }

  /**
   * 加密整份状态 → 信封对象
   * AAD 里带 rev：服务端偷偷换成别的版本会把认证打掉，解不开。
   */
  function encryptState(key, obj, rev) {
    var sb = subtle();
    var iv = randBytes(12);
    var aad = enc(AAD_PREFIX + rev);
    return sb.encrypt({ name: 'AES-GCM', iv: iv, additionalData: aad }, key, enc(JSON.stringify(obj)))
      .then(function (ctBuf) {
        var env = {
          v: ENVELOPE_V, kdf: 'PBKDF2-SHA256', iter: ITER,
          salt: state.salt, iv: bytesToB64(iv), rev: rev,
          ct: bytesToB64(new Uint8Array(ctBuf))
        };
        return env;
      });
  }

  /** 服务端返回的信封是 JSON 字符串；统一在这里解析，坏包给出明确错误 */
  function parseEnv(env) {
    if (!env) { return null; }
    if (typeof env === 'object') { return env; }
    try {
      var v = JSON.parse(String(env));
      if (!v || typeof v !== 'object') { throw new Error('bad'); }
      return v;
    } catch (e) {
      var err = new Error('云端的加密信封损坏');
      err.code = 'BAD_ENVELOPE';
      throw err;
    }
  }

  function decryptEnvelope(key, env) {
    var sb = subtle();
    var iv = b64ToBytes(env.iv);
    var aad = enc(AAD_PREFIX + env.rev);
    return sb.decrypt({ name: 'AES-GCM', iv: iv, additionalData: aad }, key, b64ToBytes(env.ct))
      .then(function (plainBuf) { return JSON.parse(dec(plainBuf)); })
      .catch(function () {
        // GCM 认证失败：口令错、版本号对不上（服务端换过包）、或者数据被改过
        var e = new Error('口令不对，或云端数据不是用这个口令加密的');
        e.code = 'BAD_PASSPHRASE';
        throw e;
      });
  }

  /* ─────────────── 配置与运行态 ─────────────── */

  var cfg = readJSON(CFG_KEY, { baseUrl: '', token: '', autoMode: 'open', autoMin: 0, rememberPass: true });
  var run = readJSON(RUN_KEY, { lastRev: 0, lastSyncAt: 0, lastConflicts: 0, dirty: false });
  var memPass = '';          // rememberPass=false 时只在内存里
  var keyCache = null;       // { pass, salt, iter, key }
  var state = { salt: '' };  // 当前 salt（加密时写进信封）
  var busy = null;           // 正在跑的那次同步（Promise）
  var debounceTimer = null;
  var applying = false;   // 正在把远端内容合进本机（此时 save() 不该再触发推送）
  var listeners = [];

  function emit(kind, payload) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](kind, payload || {}); } catch (e) { }
    }
  }
  function onChange(fn) { if (typeof fn === 'function') { listeners.push(fn); } }

  function config() {
    return {
      baseUrl: cfg.baseUrl || '', token: cfg.token || '',
      autoMode: cfg.autoMode || 'open', autoMin: cfg.autoMin || 0,
      rememberPass: cfg.rememberPass !== false,
      hasPass: !!getPass()
    };
  }

  function getPass() {
    if (cfg.rememberPass === false) { return memPass || ''; }
    try { return localStorage.getItem(PASS_KEY) || memPass || ''; } catch (e) { return memPass || ''; }
  }

  function setPass(p) {
    memPass = p || '';
    if (cfg.rememberPass === false) { return; }
    try {
      if (memPass) { localStorage.setItem(PASS_KEY, memPass); }
      else { localStorage.removeItem(PASS_KEY); }
    } catch (e) { }
  }

  function isConfigured() {
    return !!(cfg.baseUrl && cfg.token && getPass());
  }

  function setConfig(next) {
    next = next || {};
    if (next.baseUrl !== undefined) { cfg.baseUrl = String(next.baseUrl || '').trim().replace(/\/+$/, ''); }
    if (next.token !== undefined) { cfg.token = String(next.token || '').trim(); }
    if (next.autoMode !== undefined) { cfg.autoMode = next.autoMode; }
    if (next.autoMin !== undefined) { cfg.autoMin = Number(next.autoMin) || 0; }
    if (next.rememberPass !== undefined) { cfg.rememberPass = next.rememberPass !== false; }
    if (next.passphrase !== undefined) { setPass(String(next.passphrase || '')); keyCache = null; }
    writeJSON(CFG_KEY, cfg);
    emit('config', config());
    return config();
  }

  function clearConfig(keepPass) {
    cfg = { baseUrl: '', token: '', autoMode: 'open', autoMin: 0, rememberPass: cfg.rememberPass };
    writeJSON(CFG_KEY, cfg);
    if (!keepPass) { setPass(''); }
    keyCache = null;
    emit('config', config());
  }

  /** 取（或派生并缓存）密钥。salt 由云端信封决定 → 换设备也能对上。 */
  function ensureKey(envelope) {
    var pass = getPass();
    if (!pass) {
      var e0 = new Error('还没设置加密口令');
      e0.code = 'NO_PASSPHRASE';
      return Promise.reject(e0);
    }
    var salt = (envelope && envelope.salt) || (state.salt || '');
    var iter = (envelope && envelope.iter) || ITER;
    if (!salt) {
      // 云端还没有任何数据：这次是本机第一次上传，自己造一个 salt
      salt = bytesToB64(randBytes(16));
    }
    state.salt = salt;
    if (keyCache && keyCache.pass === pass && keyCache.salt === salt && keyCache.iter === iter) {
      return Promise.resolve(keyCache.key);
    }
    return deriveKey(pass, b64ToBytes(salt), iter).then(function (key) {
      keyCache = { pass: pass, salt: salt, iter: iter, key: key };
      return key;
    });
  }

  /* ─────────────── HTTP ─────────────── */

  function apiCall(method, path, body, ifMatch) {
    var url = cfg.baseUrl + path;
    var headers = { 'Authorization': 'Bearer ' + cfg.token };
    var payload;
    if (body !== undefined && body !== null) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (ifMatch !== undefined && ifMatch !== null) { headers['If-Match'] = String(ifMatch); }
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, NET_TIMEOUT) : null;
    return fetch(url, { method: method, headers: headers, body: payload, signal: ctl ? ctl.signal : undefined })
      .then(function (res) {
        if (timer) { clearTimeout(timer); }
        return res.text().then(function (txt) {
          var json = null;
          try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
          return { status: res.status, json: json, text: txt };
        });
      })
      .catch(function (err) {
        if (timer) { clearTimeout(timer); }
        var e = new Error('网络不通（' + (err && err.message ? err.message : '未知') + '）');
        e.code = 'NETWORK';
        throw e;
      });
  }

  function classify(res) {
    if (res.status === 401) {
      var e1 = new Error('令牌不对或已失效（401）');
      e1.code = 'UNAUTHORIZED';
      return e1;
    }
    if (res.status === 413) {
      var e2 = new Error('数据太大，服务器拒收（413）');
      e2.code = 'TOO_LARGE';
      return e2;
    }
    var e3 = new Error('服务器返回 ' + res.status + (res.json && res.json.error ? '（' + res.json.error + '）' : ''));
    e3.code = 'SERVER';
    return e3;
  }

  /* ─────────────── 同步主体 ─────────────── */

  function begin(kind) {
    if (busy) { return busy; }
    var chain = doSync(kind);
    busy = chain.finally ? chain.finally(function () { busy = null; })
      : chain.then(function (v) { busy = null; return v; }, function (e) { busy = null; throw e; });
    return busy;
  }

  /**
   * 核心同步。
   * kind: 'up' 双向合并（默认）｜'pull' 只拉取合并｜'force' 用本机覆盖云端
   */
  function doSync(kind) {
    if (!cfg.baseUrl || !cfg.token) {
      var e0 = new Error('还没填写服务地址或令牌');
      e0.code = 'NOT_CONFIGURED';
      return Promise.reject(e0);
    }
    emit('start', { kind: kind });
    return apiCall('GET', '/state').then(function (res) {
      if (res.status !== 200) { throw classify(res); }
      var remote = res.json || {};
      var rev = Number(remote.rev) || 0;
      if (kind === 'force') { return pushOnce(rev, rev); }
      if (!remote.envelope) {
        // 云端是空的：直接把本机推上去
        return pushOnce(rev, rev);
      }
      var remoteEnv = parseEnv(remote.envelope);
      return ensureKey(remoteEnv)
        .then(function (key) { return decryptEnvelope(key, remoteEnv).then(function (remoteState) {
          if (kind === 'pull') {
            return applyRemote(remoteState, rev).then(function (r) {
              finish({ rev: rev, pulled: true, pushed: false, conflicts: r.conflicts, added: r.added, updated: r.updated });
              return { rev: rev };
            });
          }
          return applyRemote(remoteState, rev).then(function () { return pushOnce(rev, rev); });
        }); });
    });
  }

  /** 把远端状态合进本机（不推送） */
  function applyRemote(remoteState, rev) {
    var opts = { mergeSettings: true };
    var plan = AR.Store.planMerge(remoteState, opts);
    applying = true;
    try { AR.Store.applyMerge(remoteState, opts); } finally { applying = false; }
    return Promise.resolve({
      conflicts: (plan.conflicts || []).length,
      added: (plan.additions || []).length,
      updated: (plan.updates || []).length,
      rev: rev
    });
  }

  /** 推一次；409 说明别人先推了 → 用响应里的最新密文合并后重推 */
  function pushOnce(ifMatchRev, tryRev) {
    var attempt = 0;
    function step(matchRev) {
      attempt++;
      return ensureKey(null).then(function (key) {
        var payload = AR.Store.exportPayload();
        delete payload.device;          // 设备名是本机属性，不该互相覆盖（合并时本来也会忽略）
        delete payload.exportedAt;
        return encryptState(key, payload, matchRev + 1).then(function (env) {
          var envelope = JSON.stringify(env);
          if (envelope.length > MAX_ENVELOPE) {
            var e = new Error('数据太大（' + Math.round(envelope.length / 1024) + ' KB），超过上限');
            e.code = 'TOO_LARGE';
            throw e;
          }
          return apiCall('PUT', '/state', { envelope: envelope }, matchRev).then(function (res) {
            if (res.status === 200) {
              return { rev: Number((res.json || {}).rev) || (matchRev + 1), bytes: envelope.length };
            }
            if (res.status === 409 && attempt < PUSH_RETRIES) {
              var cur = res.json || {};
              var serverRev = Number(cur.rev) || 0;
              if (!cur.envelope) { return step(serverRev); }
              var curEnv = parseEnv(cur.envelope);
              return ensureKey(curEnv)
                .then(function (k2) { return decryptEnvelope(k2, curEnv); })
                .then(function (remoteState) {
                  return applyRemote(remoteState, serverRev).then(function (r) {
                    emit('conflict-retry', { attempt: attempt, rev: serverRev, conflicts: r.conflicts });
                    return step(serverRev);
                  });
                });
            }
            throw classify(res);
          });
        });
      });
    }
    return step(ifMatchRev).then(function (r) {
      finish({ rev: r.rev, bytes: r.bytes, pushed: true, pulled: true, conflicts: 0 });
      return r;
    });
  }

  function finish(info) {
    run.lastRev = info.rev || 0;
    run.lastSyncAt = nowMs();
    run.dirty = false;
    run.lastConflicts = info.conflicts || 0;
    if (info.bytes) { run.lastBytes = info.bytes; }
    writeJSON(RUN_KEY, run);
    emit('done', info);
    /**
     * v0.4.7：每次同步（含自动同步）都提示一次。
     * 以前只有手动按钮才 toast，自动同步静默跑完，用户不知道到底同没同。
     */
    try {
      if (AR.UI && AR.UI.toast) {
        var msg = (info.pushed === false)
          ? ('已合并云端内容 · rev ' + (info.rev || 0))
          : ('已同步 · 云端 rev ' + (info.rev || 0));
        if (info.conflicts) { msg += ' · 冲突 ' + info.conflicts + ' 条（已存本机副本）'; }
        AR.UI.toast(msg);
      }
    } catch (e) { }
  }

  /* ─────────────── 对外动作 ─────────────── */

  function syncNow() { return begin('up'); }
  function pullOnly() { return begin('pull'); }
  function overwriteCloud() { return begin('force'); }

  function status() {
    return {
      configured: isConfigured(),
      baseUrl: cfg.baseUrl || '', autoMode: cfg.autoMode || 'open', autoMin: cfg.autoMin || 0,
      rememberPass: cfg.rememberPass !== false,
      lastRev: Number(run.lastRev) || 0, lastSyncAt: Number(run.lastSyncAt) || 0,
      lastConflicts: Number(run.lastConflicts) || 0,
      lastBytes: Number(run.lastBytes) || 0,
      dirty: !!run.dirty, busy: !!busy
    };
  }

  /** 本地存过盘 → 标记待推送，起一个去抖计时器 */
  function onLocalSave() {
    if (applying) { return; }          // 合并远端内容引起的保存，不算本地改动
    if (!isConfigured()) { return; }
    var mode = cfg.autoMode || 'open';
    if (mode === 'off') { return; }
    run.dirty = true;
    writeJSON(RUN_KEY, run);
    if (debounceTimer) { clearTimeout(debounceTimer); }
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      syncNow().catch(function () { /* 静默：本地已保存，下次再说 */ });
    }, mode === 'every' ? DEBOUNCE_FAST_MS : DEBOUNCE_MS);
  }

  /** 打开 App / 回到前台：按频率决定要不要拉一次 */
  function maybeAuto() {
    if (!isConfigured()) { return Promise.resolve(null); }
    var mode = cfg.autoMode || 'open';
    if (mode === 'off') { return Promise.resolve(null); }
    var freqMs = mode === 'min' ? Math.max(1, Number(cfg.autoMin) || 5) * 60000 : OPEN_GAP_MS;
    var since = nowMs() - (Number(run.lastSyncAt) || 0);
    if (since < freqMs) { return Promise.resolve(null); }
    return syncNow().catch(function (err) {
      emit('error', { message: err && err.message, code: err && err.code });
      return null;
    });
  }

  /** 历史版本（回滚用） */
  function listHistory(limit) {
    if (!cfg.baseUrl || !cfg.token) { return Promise.reject(new Error('还没配置同步')); }
    return apiCall('GET', '/history?limit=' + (limit || 5)).then(function (res) {
      if (res.status !== 200) { throw classify(res); }
      return (res.json && res.json.items) || [];
    });
  }

  /** 拉某个历史版本并合进本机（不推送）。合并前要求调用方先备份本机。 */
  function restoreRev(rev) {
    if (!cfg.baseUrl || !cfg.token) { return Promise.reject(new Error('还没配置同步')); }
    return apiCall('GET', '/state/rev/' + encodeURIComponent(rev)).then(function (res) {
      if (res.status !== 200) { throw classify(res); }
      var env = res.json && res.json.envelope;
      if (!env) { throw new Error('这个版本没有内容'); }
      var parsed;
      try { parsed = JSON.parse(env); } catch (e) { throw new Error('信封损坏'); }
      return ensureKey(parsed).then(function (key) {
        return decryptEnvelope(key, parsed).then(function (remoteState) {
          var opts = { preferIncoming: true };
          var plan = AR.Store.planMerge(remoteState, opts);
          AR.Store.applyMerge(remoteState, opts);
          return {
            rev: Number(rev), conflicts: (plan.conflicts || []).length,
            added: (plan.additions || []).length, updated: (plan.updates || []).length
          };
        });
      });
    });
  }

  /** 连通性自检：/health 不需要令牌 */
  function ping(baseUrl) {
    var url = String(baseUrl || cfg.baseUrl || '').replace(/\/+$/, '');
    if (!url) { return Promise.reject(new Error('没填服务地址')); }
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, NET_TIMEOUT) : null;
    return fetch(url + '/health', { signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (timer) { clearTimeout(timer); } return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) { throw new Error('服务端没准备好' + (j && j.db === false ? '（数据库未绑定）' : '')); }
        return j;
      })
      .catch(function (err) {
        if (timer) { clearTimeout(timer); }
        throw new Error('连不上：' + (err && err.message ? err.message : '未知'));
      });
  }

  AR.Sync = {
    /* 配置 */
    config: config, setConfig: setConfig, clearConfig: clearConfig, isConfigured: isConfigured,
    /* 动作 */
    syncNow: syncNow, pullOnly: pullOnly, overwriteCloud: overwriteCloud,
    listHistory: listHistory, restoreRev: restoreRev, ping: ping,
    /* 自动 */
    maybeAuto: maybeAuto, onLocalSave: onLocalSave,
    /* 状态/订阅 */
    status: status, onChange: onChange,
    /* 测试用 */
    _internal: {
      deriveKey: deriveKey, decryptEnvelope: decryptEnvelope, encryptState: encryptState,
      b64ToBytes: b64ToBytes, bytesToB64: bytesToB64, AAD_PREFIX: AAD_PREFIX, ITER: ITER
    }
  };
})(window.AR = window.AR || {});
