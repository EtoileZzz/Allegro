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
 *
 * 安全：
 *   · token 用长度固定 + 逐字节异或的常数时间比较
 *   · 只允许来自 App 自己的源（https://abbeyroad.local）跨域访问
 *   · 请求体上限 2MB（约合 1.5MB 明文，够几百门课）
 */

const ALLOWED_ORIGIN = 'https://abbeyroad.local';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const HISTORY_KEEP = 20;

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allow = origin === ALLOWED_ORIGIN ? origin : '';
  const h = {
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
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
        const ifMatchRaw = request.headers.get('If-Match');
        if (ifMatchRaw == null) {
          return json({ error: 'missing If-Match (expected current rev)' }, 428, cors);
        }
        const ifMatch = Number(String(ifMatchRaw).replace(/"/g, ''));
        if (!Number.isFinite(ifMatch) || ifMatch < 0) {
          return json({ error: 'bad If-Match' }, 400, cors);
        }
        const len = Number(request.headers.get('Content-Length') || 0);
        if (len > MAX_BODY_BYTES) { return json({ error: 'payload too large' }, 413, cors); }

        let body;
        try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400, cors); }
        const envelope = body && body.envelope;
        if (typeof envelope !== 'string' || envelope.length === 0) {
          return json({ error: 'missing envelope' }, 400, cors);
        }
        if (envelope.length > MAX_BODY_BYTES) { return json({ error: 'envelope too large' }, 413, cors); }
        // 只做粗校验：必须是「本 App 加密出来的信封」，别把库里塞进任意垃圾
        let parsed;
        try { parsed = JSON.parse(envelope); } catch (e) { return json({ error: 'envelope is not json' }, 400, cors); }
        if (!parsed || parsed.v !== 1 || !parsed.ct) {
          return json({ error: 'unsupported envelope' }, 400, cors);
        }

        const now = Date.now();
        const next = ifMatch + 1;
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

        await env.DB.prepare(
          'INSERT OR REPLACE INTO history (rev, envelope, updated_at) VALUES (?, ?, ?)'
        ).bind(next, envelope, now).run();
        // 只留最近 HISTORY_KEEP 版
        await env.DB.prepare(
          'DELETE FROM history WHERE rev NOT IN (SELECT rev FROM history ORDER BY rev DESC LIMIT ?)'
        ).bind(HISTORY_KEEP).run();

        return json({ rev: next }, 200, cors);
      }

      const mRev = /^\/state\/rev\/(\d+)$/.exec(path);
      if (mRev && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT rev, envelope, updated_at FROM history WHERE rev = ?')
          .bind(Number(mRev[1])).first();
        if (!row) { return json({ error: 'rev not found' }, 404, cors); }
        return json({ rev: row.rev, updatedAt: row.updated_at, envelope: row.envelope }, 200, cors);
      }

      if (path === '/history' && request.method === 'GET') {
        const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)));
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
