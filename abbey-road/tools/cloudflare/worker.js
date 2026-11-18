/**
 * Abbey Road · 云同步 Worker（Cloudflare D1）
 *
 * 职责非常窄：只当一个「带版本号的保险箱」。
 *   · 不解析业务，看不到明文（envelope 是客户端 AES-GCM 加密后的整包）
 *   · 只做三件事：读当前版本 / 条件写新版本 / 读历史版本
 *
 * 绑定（在 Cloudflare 控制台设置，不在本文件里）：
 *   DB        → D1 数据库（变量名必须叫 DB）
 *   SYNC_TOKEN → Secret，客户端请求头 Authorization: Bearer <它>
 *
 * 路由：
 *   GET  /health              健康检查（不需要 token，只回 ok/时间/是否有库）
 *   GET  /state               读当前版本  → {rev, updatedAt, envelope}
 *   PUT  /state               条件写      → 需 If-Match: <rev>；成功 {rev}；落后 409 + 当前版本
 *   GET  /state/rev/<n>       读某个历史版本（回滚用）
 *   GET  /history?limit=20    历史版本列表（不含密文，只有版本号/大小/时间）
 *   GET  /blob/:ns            读命名空间密文（ns 白名单：whisper） → {ns, rev, updatedAt, envelope}
 *   PUT  /blob/:ns            条件写命名空间密文 → If-Match: <rev>；冲突 409
 *
 * 安全：
 *   · token 用长度固定 + 逐字节异或的常数时间比较
 *   · 只允许来自 App 自己的源（https://abbeyroad.local）跨域访问
 *   · 请求体上限 2MB（约合 1.5MB 明文，够几百门课）
 */

const ALLOWED_ORIGIN = 'https://abbeyroad.local';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const HISTORY_KEEP = 20;
const BLOB_NS = ['whisper'];      // 只允许这两种命名空间（以后要加就写在这里）
const BLOB_MAX_BYTES = 5 * 1024 * 1024;
const MEDIA_MAX_BYTES = 1024 * 1024;
const TEXT_ENC = new TextEncoder();

function utf8Bytes(str) {
  return TEXT_ENC.encode(String(str || '')).length;
}

function parseIfMatch(request) {
  const raw = request.headers.get('If-Match');
  if (raw == null) { return { error: 'missing If-Match (expected current rev)', status: 428 }; }
  const cleaned = String(raw).trim().replace(/^"+|"+$/g, '').trim();
  if (!/^\d+$/.test(cleaned)) { return { error: 'bad If-Match', status: 400 }; }
  const n = Number(cleaned);
  if (!Number.isSafeInteger(n) || n < 0) { return { error: 'bad If-Match', status: 400 }; }
  return { rev: n };
}

async function readCheckedBody(request, maxBytes) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > maxBytes) { return { error: 'payload too large', status: 413 }; }
  const rawText = await request.text();
  if (utf8Bytes(rawText) > maxBytes) { return { error: 'payload too large', status: 413 }; }
  let body;
  try { body = JSON.parse(rawText); } catch (e) { return { error: 'invalid json', status: 400 }; }
  const envelope = body && body.envelope;
  if (typeof envelope !== 'string' || envelope.length === 0) {
    return { error: 'missing envelope', status: 400 };
  }
  if (utf8Bytes(envelope) > maxBytes) { return { error: 'envelope too large', status: 413 }; }
  let parsed;
  try { parsed = JSON.parse(envelope); } catch (e) { return { error: 'envelope is not json', status: 400 }; }
  return { envelope, parsed };
}

async function runStatements(env, stmts) {
  if (typeof env.DB.batch === 'function') {
    return env.DB.batch(stmts);
  }
  for (const s of stmts) { await s.run(); }
}

function allowedNs(ns) {
  return BLOB_NS.indexOf(ns) >= 0;
}

async function readBlob(env, ns) {
  const row = await env.DB.prepare('SELECT rev, envelope, updated_at FROM blob_state WHERE ns = ?').bind(ns).first();
  return row || { rev: 0, envelope: null, updated_at: 0 };
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allow = origin === ALLOWED_ORIGIN ? origin : '';
  const h = {
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, If-Match, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (allow) { h['Access-Control-Allow-Origin'] = allow; }
  return h;
}

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {})
  });
}

/** 常数时间比较：长度不同直接 false（长度本身不算秘密） */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') { return false; }
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) { return false; }
  let diff = 0;
  for (let i = 0; i < ea.length; i++) { diff |= ea[i] ^ eb[i]; }
  return diff === 0;
}

function authed(request, env) {
  const h = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  if (!m || !env.SYNC_TOKEN) { return false; }
  return safeEqual(m[1].trim(), env.SYNC_TOKEN);
}

async function readState(env) {
  const row = await env.DB.prepare('SELECT rev, envelope, updated_at FROM state WHERE id = 1').first();
  return row || { rev: 0, envelope: null, updated_at: 0 };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // 健康检查故意不要求 token：方便你在浏览器里确认「Worker 活了、库绑上了」
    if (path === '/health') {
      let hasDb = false;
      try { await env.DB.prepare('SELECT 1').first(); hasDb = true; } catch (e) { hasDb = false; }
      return json({ ok: true, db: hasDb, now: Date.now() }, hasDb ? 200 : 500, cors);
    }

    if (!authed(request, env)) {
      return json({ error: 'unauthorized' }, 401, cors);
    }

    try {
      if (path === '/state' && request.method === 'GET') {
        const row = await readState(env);
        return json({ rev: row.rev, updatedAt: row.updated_at, envelope: row.envelope }, 200, cors);
      }

      if (path === '/state' && request.method === 'PUT') {
        const im = parseIfMatch(request);
        if (im.error) { return json({ error: im.error }, im.status, cors); }
        const ifMatch = im.rev;

        const checked = await readCheckedBody(request, MAX_BODY_BYTES);
        if (checked.error) { return json({ error: checked.error }, checked.status, cors); }
        const { envelope, parsed } = checked;
        // 只做粗校验：必须是「本 App 加密出来的信封」，别把库里塞进任意垃圾
        if (!parsed || parsed.v !== 1 || !parsed.ct) {
          return json({ error: 'unsupported envelope' }, 400, cors);
        }

        const now = Date.now();
        const next = ifMatch + 1;
        // 兜底：种子行不在时（新库 / 手动清理过）先补出来。
        // 少了这一行，下面的 CAS UPDATE 永远 0 行受影响 → 客户端永远 409，第一次上传就卡死。
        await env.DB.prepare(
          'INSERT OR IGNORE INTO state (id, rev, envelope, updated_at) VALUES (1, 0, NULL, 0)'
        ).run();
        // CAS：版本对不上就是 0 行受影响 —— 两台设备同时推不会互相覆盖
        const res = await env.DB.prepare(
          'UPDATE state SET rev = ?, envelope = ?, updated_at = ? WHERE id = 1 AND rev = ?'
        ).bind(next, envelope, now, ifMatch).run();

        const changes = res && res.meta ? res.meta.changes : 0;
        if (!changes) {
          // 落后了：把当前版本一起返回，客户端可以立刻合并再重推，省一次往返
          const cur = await readState(env);
          return json({ error: 'conflict', rev: cur.rev, updatedAt: cur.updated_at, envelope: cur.envelope }, 409, cors);
        }

        await runStatements(env, [
          env.DB.prepare(
            'INSERT OR REPLACE INTO history (rev, envelope, updated_at) VALUES (?, ?, ?)'
          ).bind(next, envelope, now),
          // 只留最近 HISTORY_KEEP 版
          env.DB.prepare(
            'DELETE FROM history WHERE rev NOT IN (SELECT rev FROM history ORDER BY rev DESC LIMIT ?)'
          ).bind(HISTORY_KEEP)
        ]);

        return json({ rev: next }, 200, cors);
      }

      if (path === '/blob/whisper/media') {
        await env.DB.prepare(
          'CREATE TABLE IF NOT EXISTS whisper_media (id TEXT PRIMARY KEY, envelope TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)'
        ).run();
        if (request.method === 'GET') {
          const rows = await env.DB.prepare('SELECT id, size, updated_at FROM whisper_media ORDER BY updated_at DESC').all();
          const items = (rows && rows.results) ? rows.results : [];
          return json({ ids: items.map((r) => r.id), items: items }, 200, cors);
        }
        if (request.method === 'DELETE') {
          await env.DB.prepare('DELETE FROM whisper_media').run();
          return json({ cleared: true }, 200, cors);
        }
        return json({ error: 'method not allowed' }, 405, cors);
      }

      const mMedia = /^\/blob\/whisper\/media\/([A-Za-z0-9_-]{4,64})$/.exec(path);
      if (mMedia) {
        const mid = mMedia[1];
        await env.DB.prepare(
          'CREATE TABLE IF NOT EXISTS whisper_media (id TEXT PRIMARY KEY, envelope TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)'
        ).run();
        if (request.method === 'GET') {
          const row = await env.DB.prepare('SELECT id, envelope, size, updated_at FROM whisper_media WHERE id = ?').bind(mid).first();
          if (!row) { return json({ error: 'media not found' }, 404, cors); }
          return json({ id: row.id, envelope: row.envelope, size: row.size, updatedAt: row.updated_at }, 200, cors);
        }
        if (request.method === 'PUT') {
          const checked = await readCheckedBody(request, MEDIA_MAX_BYTES);
          if (checked.error) { return json({ error: checked.error }, checked.status, cors); }
          const { envelope, parsed } = checked;
          if (!parsed || parsed.v !== 1 || parsed.ns !== 'whisper-media' || parsed.id !== mid || !parsed.ct || !parsed.iv || !parsed.salt) {
            return json({ error: 'unsupported media envelope' }, 400, cors);
          }
          const now = Date.now();
          const size = utf8Bytes(envelope);
          await env.DB.prepare(
            'INSERT OR REPLACE INTO whisper_media (id, envelope, size, updated_at) VALUES (?, ?, ?, ?)'
          ).bind(mid, envelope, size, now).run();
          return json({ id: mid, size: size, updatedAt: now }, 200, cors);
        }
        if (request.method === 'DELETE') {
          await env.DB.prepare('DELETE FROM whisper_media WHERE id = ?').bind(mid).run();
          return json({ id: mid, deleted: true }, 200, cors);
        }
        return json({ error: 'method not allowed' }, 405, cors);
      }

      const mBlob = /^\/blob\/([a-z0-9_-]{1,24})$/.exec(path);
      if (mBlob) {
        const ns = mBlob[1];
        if (!allowedNs(ns)) { return json({ error: 'unknown namespace' }, 404, cors); }

        if (request.method === 'GET') {
          const row = await readBlob(env, ns);
          return json({ ns: ns, rev: row.rev, updatedAt: row.updated_at, envelope: row.envelope }, 200, cors);
        }

        if (request.method === 'PUT') {
          const im = parseIfMatch(request);
          if (im.error) { return json({ error: im.error }, im.status, cors); }
          const ifMatch = im.rev;

          const checked = await readCheckedBody(request, BLOB_MAX_BYTES);
          if (checked.error) { return json({ error: checked.error }, checked.status, cors); }
          const { envelope, parsed } = checked;
          if (!parsed || parsed.v !== 1 || !parsed.ct || !parsed.iv || !parsed.salt || !parsed.ns || parsed.ns !== ns) {
            return json({ error: 'unsupported envelope' }, 400, cors);
          }

          const now = Date.now();
          const next = ifMatch + 1;
          // 同 /state：命名空间第一次上传时表里还没有这一行，先补 rev 0 的种子行
          await env.DB.prepare(
            'INSERT OR IGNORE INTO blob_state (ns, rev, envelope, updated_at) VALUES (?, 0, NULL, 0)'
          ).bind(ns).run();
          const res = await env.DB.prepare(
            'UPDATE blob_state SET rev = ?, envelope = ?, updated_at = ? WHERE ns = ? AND rev = ?'
          ).bind(next, envelope, now, ns, ifMatch).run();

          const changes = res && res.meta ? res.meta.changes : 0;
          if (!changes) {
            const cur = await readBlob(env, ns);
            return json({ error: 'conflict', ns: ns, rev: cur.rev, updatedAt: cur.updated_at, envelope: cur.envelope }, 409, cors);
          }

          await runStatements(env, [
            env.DB.prepare(
              'INSERT OR REPLACE INTO blob_history (ns, rev, envelope, updated_at) VALUES (?, ?, ?, ?)'
            ).bind(ns, next, envelope, now),
            env.DB.prepare(
              'DELETE FROM blob_history WHERE ns = ? AND rev NOT IN (SELECT rev FROM blob_history WHERE ns = ? ORDER BY rev DESC LIMIT ?)'
            ).bind(ns, ns, HISTORY_KEEP)
          ]);

          return json({ ns: ns, rev: next }, 200, cors);
        }

        return json({ error: 'method not allowed' }, 405, cors);
      }

      const mRev = /^\/state\/rev\/(\d+)$/.exec(path);
      if (mRev && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT rev, envelope, updated_at FROM history WHERE rev = ?')
          .bind(Number(mRev[1])).first();
        if (!row) { return json({ error: 'rev not found' }, 404, cors); }
        return json({ rev: row.rev, updatedAt: row.updated_at, envelope: row.envelope }, 200, cors);
      }

      if (path === '/history' && request.method === 'GET') {
        const rawLimParam = url.searchParams.get('limit');
        const rawLim = (rawLimParam == null || rawLimParam === '') ? 20 : Number(rawLimParam);
        const limit = Math.min(50, Math.max(1, Number.isFinite(rawLim) ? Math.floor(rawLim) : 20));
        const rows = await env.DB.prepare(
          'SELECT rev, updated_at, LENGTH(envelope) AS size FROM history ORDER BY rev DESC LIMIT ?'
        ).bind(limit).all();
        const list = (rows && rows.results) ? rows.results : [];
        const cur = await readState(env);
        return json({ current: cur.rev, items: list }, 200, cors);
      }

      return json({ error: 'not found' }, 404, cors);
    } catch (e) {
      return json({ error: 'internal', detail: String(e && e.message ? e.message : e) }, 500, cors);
    }
  }
};
