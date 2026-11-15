/* 用「线上实际部署的那份 Worker 源码」在本地复现 409，证明种子行就是症结 */
const fs = require('fs');
const sqlite = require('node:sqlite');
const ACCT = '2031b03dabe52e2dc3784cd248639518';
const DB = '043e6fbb-8ea3-4cd0-8add-3c18e5cbb240';
const TOKEN = process.env.CF_TOKEN || '';

async function d1(query, params = []) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/d1/database/${DB}/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: query, params }),
    signal: AbortSignal.timeout(30000)
  });
  const j = await r.json();
  return j.result && j.result[0] ? j.result[0].results : [];
}

(async () => {
  const live = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/workers/scripts/abbeyroad-sync`,
    { headers: { Authorization: 'Bearer ' + TOKEN } });
  const raw = await live.text();
  /* 接口回的是 multipart：取 worker.js 那一段 */
  let src = raw;
  const cut = raw.indexOf('name="worker.js"');
  if (cut >= 0) {
    const bodyStart = raw.indexOf('\r\n\r\n', cut) + 4;
    const boundary = raw.slice(0, raw.indexOf('\r\n'));
    const end = raw.lastIndexOf('\r\n' + boundary);
    src = raw.slice(bodyStart, end);
  }
  console.log('线上 Worker 源码长度:', src.length, '| 含 /blob/:ns 路由:', src.indexOf('/blob/') > 0,
    '| 含补种子行:', src.indexOf('INSERT OR IGNORE INTO blob_state') > 0);

  const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec(fs.readFileSync('tools/cloudflare/schema.sql', 'utf8'));
  db.exec("DELETE FROM blob_state");   // 换成线上修复前的状态：这张表是空的

  const env = {
    DB: {
      prepare(sql) {
        let args = [];
        const api = {
          bind() { args = [...arguments]; return api; },
          first() { return db.prepare(sql).get(...args) || null; },
          run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) || 0 } }; },
          all() { return { results: db.prepare(sql).all(...args) }; }
        };
        return api;
      }
    },
    SYNC_TOKEN: 't'
  };
  const put = async (rev) => {
    const res = await mod.default.fetch(new Request('https://abbeyroad.local/blob/whisper', {
      method: 'PUT',
      headers: { Authorization: 'Bearer t', 'If-Match': String(rev), 'Content-Type': 'application/json', Origin: 'https://abbeyroad.local' },
      body: JSON.stringify({ envelope: JSON.stringify({ v: 1, ns: 'whisper', salt: 's', iv: 'i', ct: 'c', rev: rev + 1 }) })
    }), env);
    return { status: res.status, body: await res.json() };
  };

  const before = await put(0);
  console.log('① 表里没有种子行（线上修复前的真实状态）→ PUT rev0 =', before.status, before.body.error || '');

  db.exec("INSERT OR IGNORE INTO blob_state (ns, rev, envelope, updated_at) VALUES ('whisper', 0, NULL, 0)");
  const after = await put(0);
  console.log('② 补上种子行（= 我刚在线上执行的那条 SQL）→ PUT rev0 =', after.status, JSON.stringify(after.body));

  const prod = await d1("SELECT ns, rev, envelope IS NULL AS empty FROM blob_state");
  console.log('③ 线上 D1 现在的 blob_state:', JSON.stringify(prod));
})();
