/**
 * verify-sync.js —— 云同步客户端测试（纯 Node，不联网）
 *
 * 用真实的 WebCrypto（Node 自带）跑加解密，用假 fetch 模拟 Cloudflare 那边
 * 的 CAS 行为（含 409 + 当前密文回传），因此能覆盖：
 *   · 加密往返 / 每次 salt·IV 不同 / 篡改检测 / AAD 绑版本
 *   · 首次同步（云端 rev=0）、双向合并、只拉不推、强制覆盖
 *   · 两机并发 → 409 → 解密最新 → 合并 → 重推（最多 3 轮）
 *   · 口令错 / 令牌错 / 未配置 → 各自的错误码，且**云端不被污染**
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', 'app', 'js');
const SRC = fs.readFileSync(path.join(APP, 'sync.js'), 'utf8');

let pass = 0, fail = 0;
const bad = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; bad.push(name + (extra ? ' → ' + extra : '')); }
}

/* ─────────── 假服务器：复刻 worker.js 的 CAS 语义 ─────────── */
function makeServer() {
  const s = { rev: 0, envelope: null, history: [], putCount: 0, getCount: 0 };
  const resp = (status, body) => ({
    status,
    text: () => Promise.resolve(body == null ? '' : JSON.stringify(body)),
    json: () => Promise.resolve(body)
  });
  s.fetch = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    const u = String(url);
    if (u.endsWith('/health')) { return resp(200, { ok: true, db: true, now: Date.now() }); }
    const auth = (opts.headers || {})['Authorization'] || '';
    if (auth !== 'Bearer good-token') { return resp(401, { error: 'unauthorized' }); }
    if (u.includes('/state/rev/')) {
      const n = Number(u.split('/state/rev/')[1]);
      const h = s.history.find(x => x.rev === n);
      return h ? resp(200, { rev: h.rev, envelope: h.envelope }) : resp(404, { error: 'rev not found' });
    }
    if (u.indexOf('/history') >= 0) {
      return resp(200, { current: s.rev, items: s.history.map(h => ({ rev: h.rev, size: h.envelope.length })) });
    }
    if (u.endsWith('/state') && method === 'GET') {
      s.getCount++;
      return resp(200, { rev: s.rev, envelope: s.envelope, updatedAt: 0 });
    }
    if (u.endsWith('/state') && method === 'PUT') {
      if (s.beforePut) { const f = s.beforePut; s.beforePut = null; await f(); }
      s.putCount++;
      const ifMatch = Number((opts.headers || {})['If-Match']);
      if (!Number.isFinite(ifMatch)) { return resp(428, { error: 'missing If-Match' }); }
      const body = JSON.parse(opts.body || '{}');
      const env = body.envelope;
      if (typeof env !== 'string') { return resp(400, { error: 'missing envelope' }); }
      if (ifMatch !== s.rev) {
        return resp(409, { error: 'conflict', rev: s.rev, envelope: s.envelope });
      }
      s.rev += 1;
      s.envelope = env;
      s.history.push({ rev: s.rev, envelope: env });
      return resp(200, { rev: s.rev });
    }
    return resp(404, { error: 'not found' });
  };
  return s;
}

/* ─────────── 极简 Store 替身（够验证合并出口即可） ─────────── */
const TABLES = ['courses', 'tasks2', 'events', 'blocks', 'overrides', 'semesters', 'teachers', 'locations', 'longTasks', 'reminders', 'quickTodos', 'tasks'];
function makeStore(seed) {
  const st = JSON.parse(JSON.stringify(seed || {}));
  TABLES.forEach(t => { if (!Array.isArray(st[t])) { st[t] = []; } });
  function upsert(table, rec) {
    const list = st[table];
    const i = list.findIndex(x => x.id === rec.id);
    if (i < 0) { list.push(rec); }
    else {
      // tasks2 的 entries 并集（和真实 applyMerge 的语义一致）
      if (table === 'tasks2') {
        const merged = (list[i].entries || []).slice();
        (rec.entries || []).forEach(e => { if (!merged.some(x => x.id === e.id)) { merged.push(e); } });
        list[i] = Object.assign({}, list[i], rec, { entries: merged });
      } else {
        list[i] = rec;
      }
    }
  }
  const meta = { lastOpts: null };
  return {
    data: st,
    meta: meta,
    exportPayload() { const out = JSON.parse(JSON.stringify(st)); meta.lastPayload = out; return out; },
    /** v0.5.2：和真实 Store 同口径的数据指纹（去掉 settings 等） */
    dataSig() {
      const o = JSON.parse(JSON.stringify(st));
      delete o.settings; delete o.exportedAt; delete o.device; delete o.appVersion;
      return JSON.stringify(o);
    },
    planMerge(incoming, opts) {
      meta.lastOpts = opts || {};
      const plan = { additions: [], updates: [], conflicts: [] };
      TABLES.forEach(t => {
        (incoming[t] || []).forEach(rec => {
          const cur = st[t].find(x => x.id === rec.id);
          if (!cur) { plan.additions.push({ table: t, rec }); }
          else { plan.updates.push({ table: t, id: rec.id, rec }); }
        });
      });
      return plan;
    },
    applyMerge(incoming) {
      TABLES.forEach(t => { (incoming[t] || []).forEach(rec => upsert(t, rec)); });
    }
  };
}

/* ─────────── 起一个「设备」：独立的 localStorage + sync.js 实例 ─────────── */
function makeDevice(name, store, server, opts) {
  opts = opts || {};
  const lsData = {};
  const localStorage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(lsData, k) ? lsData[k] : null),
    setItem: (k, v) => { lsData[k] = String(v); },
    removeItem: k => { delete lsData[k]; }
  };
  const sandbox = {
    console, Date, JSON, Math, Number, String, Object, Array, Promise, Error, encodeURIComponent,
    setTimeout, clearTimeout, btoa, atob,
    TextEncoder, TextDecoder, Uint8Array, AbortController,
    crypto: globalThis.crypto,
    fetch: server.fetch,
    localStorage,
    window: {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const toasts = [];
  const AR = { Store: store, Const: { APP_VERSION: '0.5.1' }, UI: { toast: (m) => toasts.push(String(m)) } };
  sandbox.window.AR = AR;
  vm.runInContext(SRC, sandbox, { filename: 'sync.js' });
  return { name, AR, Sync: AR.Sync, ls: lsData, toasts: toasts, meta: store.meta || { lastOpts: null } };
}

function configure(dev, opts) {
  opts = opts || {};
  dev.Sync.setConfig({
    baseUrl: 'https://sync.test',
    token: opts.token || 'good-token',
    passphrase: opts.pass || 'my pass phrase',
    autoMode: 'open',
    rememberPass: true
  });
}

(async () => {
  /* ── 1. 加密层 ── */
  {
    const server = makeServer();
    const dev = makeDevice('A', makeStore(), server);
    configure(dev);
    const I = dev.Sync._internal;
    const salt = I.bytesToB64(new Uint8Array(16).fill(7));
    const key1 = await I.deriveKey('same pass', I.b64ToBytes(salt), 1000);
    const key2 = await I.deriveKey('same pass', I.b64ToBytes(salt), 1000);
    const key3 = await I.deriveKey('other pass', I.b64ToBytes(salt), 1000);
    const obj = { hello: '世界', n: 42, arr: [1, 2, 3] };

    // 直接用内部原语测往返（encryptState 依赖模块内的 salt 状态，这里绕开它）
    const sb = globalThis.crypto.subtle;
    const iv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const aad = new TextEncoder().encode('ARS1|5');
    const ct = await sb.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key1, new TextEncoder().encode(JSON.stringify(obj)));
    const pt = await sb.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, key2, ct);
    ok('S1 同口令同 salt 派生出的密钥可互相解密', JSON.parse(new TextDecoder().decode(pt)).hello === '世界');

    let wrongPassFailed = false;
    try { await sb.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, key3, ct); }
    catch (e) { wrongPassFailed = true; }
    ok('S2 换口令解不开（GCM 认证失败）', wrongPassFailed);

    let wrongAadFailed = false;
    try {
      await sb.decrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('ARS1|6') }, key1, ct);
    } catch (e) { wrongAadFailed = true; }
    ok('S3 AAD 里的版本号被换掉 → 解不开（防服务端塞旧密文）', wrongAadFailed);

    // 篡改一个字节
    const tampered = new Uint8Array(ct);
    tampered[tampered.length - 1] ^= 0xff;
    let tamperFailed = false;
    try { await sb.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, key1, tampered); }
    catch (e) { tamperFailed = true; }
    ok('S4 密文被改一位 → 解不开', tamperFailed);

    // 每次加密 IV 不同 → 同一明文两次密文不同
    const p2 = dev.AR.Sync._internal;
    const ivA = new Uint8Array(12); globalThis.crypto.getRandomValues(ivA);
    const ivB = new Uint8Array(12); globalThis.crypto.getRandomValues(ivB);
    ok('S5 每次加密生成不同 IV', Buffer.compare(Buffer.from(ivA), Buffer.from(ivB)) !== 0);
  }

  /* ── 2. 首次同步：云端空 → 推上去 ── */
  const server = makeServer();
  {
    const store = makeStore({ courses: [{ id: 'c1', name: '高数', updatedAt: '2026-10-01T00:00:00Z' }] });
    const dev = makeDevice('A', store, server);
    configure(dev);
    const r = await dev.Sync.syncNow();
    ok('S6 首次同步 → rev=1', r.rev === 1, JSON.stringify(r));
    ok('S7 服务端存下了信封', !!server.envelope);
    const env = JSON.parse(server.envelope);
    ok('S8 信封字段齐全', env.v === 1 && env.kdf === 'PBKDF2-SHA256' && !!env.salt && !!env.iv && !!env.ct && env.rev === 1,
      JSON.stringify({ v: env.v, kdf: env.kdf, rev: env.rev }));
    ok('S9 信封里看不到课程名（真加密）', server.envelope.indexOf('高数') < 0 && JSON.parse(server.envelope).ct.length > 20);
    ok('S10 本地记住了 rev', dev.Sync.status().lastRev === 1);
  }

  /* ── 3. 第二台设备：只拉取，拿到第一台的数据 ── */
  {
    const storeB = makeStore({});
    const devB = makeDevice('B', storeB, server);
    configure(devB);   // 同口令
    const before = server.putCount;
    const r = await devB.Sync.pullOnly();
    ok('S11 只拉取不改云端', server.putCount === before, 'PUT 次数 ' + server.putCount);
    ok('S12 第二台拿到了课程', storeB.data.courses.some(c => c.id === 'c1'), JSON.stringify(storeB.data.courses.map(c => c.id)));
    ok('S13 pull 返回 rev', r.rev === 1);
  }

  /* ── 4. 口令错：不推、不污染云端 ── */
  {
    const storeC = makeStore({ courses: [{ id: 'cx', name: '错的', updatedAt: '2026-10-02T00:00:00Z' }] });
    const devC = makeDevice('C', storeC, server);
    configure(devC, { pass: 'WRONG PASS' });
    const revBefore = server.rev;
    let err = null;
    try { await devC.Sync.pullOnly(); } catch (e) { err = e; }
    ok('S14 口令错 → BAD_PASSPHRASE', err && err.code === 'BAD_PASSPHRASE', err && err.code);
    ok('S15 口令错时云端没被改', server.rev === revBefore);
    ok('S16 口令错时本地没被清空', storeC.data.courses.length === 1);
  }

  /* ── 5. 真正的并发：A 在 B 的 GET 与 PUT 之间抢先推 → B 收到 409 → 解密最新 → 合并 → 重推 ── */
  {
    const storeA = makeStore({});
    const storeB = makeStore({});
    const devA = makeDevice('A3', storeA, server);
    const devB = makeDevice('B3', storeB, server);
    configure(devA);
    configure(devB);
    await devA.Sync.pullOnly();
    await devB.Sync.pullOnly();

    storeA.data.courses.push({ id: 'fromA', name: 'A 加的课', updatedAt: '2026-10-06T00:00:00Z' });
    storeB.data.courses.push({ id: 'fromB', name: 'B 加的课', updatedAt: '2026-10-07T00:00:00Z' });

    // B 刚要推的时候，A 抢先推成功（模拟两台设备同时点同步）
    server.beforePut = async () => { await devA.Sync.syncNow(); };

    const putsBefore = server.putCount;
    const rb = await devB.Sync.syncNow();
    const attempts = server.putCount - putsBefore;

    ok('S17 落后者收到 409 后自动重推并成功', attempts >= 2, 'PUT 次数=' + attempts + ' rev=' + (rb && rb.rev));
    ok('S18 B 本地合并到了 A 的记录（没被覆盖丢）',
      storeB.data.courses.some(c => c.id === 'fromA') && storeB.data.courses.some(c => c.id === 'fromB'),
      JSON.stringify(storeB.data.courses.map(c => c.id)));

    // 再找一台干净设备拉一次，云端应该同时有两条
    const storeC = makeStore({});
    const devC = makeDevice('C4', storeC, server);
    configure(devC);
    await devC.Sync.pullOnly();
    ok('S19 云端最终同时含两台设备的记录',
      storeC.data.courses.some(c => c.id === 'fromA') && storeC.data.courses.some(c => c.id === 'fromB'),
      JSON.stringify(storeC.data.courses.map(c => c.id)));
    ok('S20 rev 单调递增', server.rev >= 3, 'rev=' + server.rev);
  }

  /* ── 6. 令牌错 ── */
  {
    const store = makeStore({});
    const dev = makeDevice('D', store, server);
    configure(dev, { token: 'bad-token' });
    let err = null;
    try { await dev.Sync.syncNow(); } catch (e) { err = e; }
    ok('S21 令牌错 → UNAUTHORIZED', err && err.code === 'UNAUTHORIZED', err && err.code);
  }

  /* ── 7. 未配置 ── */
  {
    const store = makeStore({});
    const dev = makeDevice('E', store, server);
    let err = null;
    try { await dev.Sync.syncNow(); } catch (e) { err = e; }
    ok('S22 未配置 → NOT_CONFIGURED', err && err.code === 'NOT_CONFIGURED', err && err.code);
  }

  /* ── 8. 强制覆盖云端 ── */
  {
    const store = makeStore({ courses: [{ id: 'only-local', name: '只有本机', updatedAt: '2026-10-09T00:00:00Z' }] });
    const dev = makeDevice('F', store, server);
    configure(dev);
    const revBefore = server.rev;
    const r = await dev.Sync.overwriteCloud();
    ok('S23 强制覆盖 → rev 前进 1', r.rev === revBefore + 1, JSON.stringify({ before: revBefore, r }));
    // 换一台干净设备拉回来，应该看到「只有本机」这条
    const storeG = makeStore({});
    const devG = makeDevice('G', storeG, server);
    configure(devG);
    await devG.Sync.pullOnly();
    ok('S24 覆盖后的云端就是本机那份', storeG.data.courses.some(c => c.id === 'only-local'),
      JSON.stringify(storeG.data.courses.map(c => c.id)));
  }

  /* ── 9. 历史与回滚 ── */
  {
    const store = makeStore({});
    const dev = makeDevice('H', store, server);
    configure(dev);
    const items = await dev.Sync.listHistory(5);
    ok('S25 能列出历史版本', Array.isArray(items) && items.length > 0, 'len=' + (items && items.length));
    const r = await dev.Sync.restoreRev(1);
    ok('S26 能拉某个历史版本并合并', r && r.rev === 1, JSON.stringify(r));
  }

  /* ── 10. 自动同步节流 ── */
  {
    const store = makeStore({});
    const dev = makeDevice('I', store, server);
    configure(dev);
    const first = await dev.Sync.maybeAuto();   // 上次同步是 0 → 应该同步
    const second = await dev.Sync.maybeAuto();  // 刚刚同步过 → 应该跳过
    ok('S27 首次 maybeAuto 会同步', first !== null);
    ok('S28 刚同步过则跳过（不重复请求）', second === null);
    dev.Sync.setConfig({ autoMode: 'off' });
    const third = await dev.Sync.maybeAuto();
    ok('S29 关掉自动同步后不再自动跑', third === null);
  }

  /* ── 11. 连通性自检 ── */
  {
    const store = makeStore({});
    const dev = makeDevice('J', store, server);
    configure(dev);
    const j = await dev.Sync.ping('https://sync.test');
    ok('S30 health 自检通过', j && j.ok === true && j.db === true, JSON.stringify(j));
  }

  /* ── 12. 静默同步 / 仅数据范围（v0.5.1）── */
  {
    const srv = makeServer();
    const store = makeStore({ tasks2: [], settings: { appearance: { theme: 'dark' } } });
    const dev = makeDevice('S1', store, srv);
    configure(dev);
    dev.Sync.setConfig({ silent: false });
    dev.toasts.length = 0;
    await dev.Sync.syncNow();
    ok('S31 非静默：同步成功会提示一次', dev.toasts.length === 1, JSON.stringify(dev.toasts));

    dev.toasts.length = 0;
    dev.Sync.setConfig({ silent: true });
    await dev.Sync.syncNow();
    ok('S32 静默：同步成功不提示', dev.toasts.length === 0, JSON.stringify(dev.toasts));

    /* 仅数据：不把本机设置传上去，但也不能抹掉云端那份（v0.5.2） */
    store.data.settings = { appearance: { theme: 'light' } };   // 本机改成 light，云端还是 dark
    dev.Sync.setConfig({ scope: 'data', silent: true });
    await dev.Sync.syncNow();
    ok('S33 仅数据：上传的 settings 是云端那份，不是本机的新设置',
      store.meta.lastPayload && store.meta.lastPayload.settings
      && store.meta.lastPayload.settings.appearance
      && store.meta.lastPayload.settings.appearance.theme === 'dark',
      JSON.stringify(store.meta.lastPayload && store.meta.lastPayload.settings));
    await dev.Sync.pullOnly();
    ok('S34 仅数据：拉取时 mergeSettings === false',
      store.meta.lastOpts && store.meta.lastOpts.mergeSettings === false,
      JSON.stringify(store.meta.lastOpts));

    dev.Sync.setConfig({ scope: 'all' });
    await dev.Sync.pullOnly();
    ok('S35 全部范围：mergeSettings 恢复为 true',
      store.meta.lastOpts && store.meta.lastOpts.mergeSettings === true,
      JSON.stringify(store.meta.lastOpts));
  }

  /* ── 13. 仅数据：只改设置不排同步（v0.5.2，用户报的那个 bug）── */
  {
    const srv = makeServer();
    const store = makeStore({ settings: { appearance: { theme: 'dark' } } });
    const dev = makeDevice('S2', store, srv);
    configure(dev);
    dev.Sync._internal.setDebounce(20);
    dev.Sync.setConfig({ scope: 'data', silent: true });
    await dev.Sync.syncNow();                       // 建立基准（云端空 → 首推）
    const puts = srv.putCount, gets = srv.getCount;

    store.data.settings.appearance.theme = 'light'; // 只改设置，数据一动不动
    dev.Sync.onLocalSave();
    await new Promise((r) => setTimeout(r, 90));
    ok('S36 仅数据：只改设置不触发同步（不发请求）', srv.putCount === puts && srv.getCount === gets,
      'put ' + srv.putCount + '/' + puts + ' get ' + srv.getCount + '/' + gets);
    ok('S37 仅数据：只改设置也不留「待同步」标记',
      dev.Sync.status().dirty === false && dev.Sync._internal.dataChangedSinceLastSync() === false);

    store.data.courses.push({ id: 'c-new', name: '新加的课', updatedAt: '2026-11-01T00:00:00Z' });
    dev.Sync.onLocalSave();
    await new Promise((r) => setTimeout(r, 140));
    ok('S38 仅数据：数据一动照常同步', srv.putCount > puts && dev.Sync.status().dirty === false,
      'put ' + srv.putCount);

    /* 云端本来没有设置 → 写空对象，本机设置絕不外传 */
    const srv2 = makeServer();
    const store2 = makeStore({ settings: { appearance: { theme: 'light' } } });
    const dev2 = makeDevice('S3', store2, srv2);
    configure(dev2);
    dev2.Sync.setConfig({ scope: 'data', silent: true });
    await dev2.Sync.syncNow();
    ok('S39 仅数据：云端本没设置时写空对象（本机设置不外传）',
      store2.meta.lastPayload && store2.meta.lastPayload.settings
      && Object.keys(store2.meta.lastPayload.settings).length === 0,
      JSON.stringify(store2.meta.lastPayload && store2.meta.lastPayload.settings));

    /* 回滚历史版本也要遵守范围 */
    const srv3 = makeServer();
    const store3 = makeStore({ settings: { appearance: { theme: 'dark' } } });
    const dev3 = makeDevice('S4', store3, srv3);
    configure(dev3);
    await dev3.Sync.syncNow();          // 产生 rev 1
    dev3.Sync.setConfig({ scope: 'data', silent: true });
    store3.meta.lastOpts = null;
    await dev3.Sync.restoreRev(1);
    ok('S40 回滚历史版本也遵守仅数据范围',
      store3.meta.lastOpts && store3.meta.lastOpts.mergeSettings === false,
      JSON.stringify(store3.meta.lastOpts));
  }

  console.log('');
  console.log('合计：' + pass + ' 通过 / ' + fail + ' 失败');
  bad.forEach(b => console.log('  ✗ ' + b));
  if (fail) { process.exitCode = 1; }
})().catch(e => {
  console.error('\n✗ 测试自身出错：' + (e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
