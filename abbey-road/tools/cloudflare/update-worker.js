/* 只更新 Worker 脚本与表结构：不改 SYNC_TOKEN secret，不动现有绑定 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const API = 'https://api.cloudflare.com/client/v4';
const TOKEN = process.env.CF_TOKEN || '';
const SCRIPT = 'abbeyroad-sync';
const DB_NAME = 'abbeyroad-sync';
const DIR = __dirname;

function splitSqlStatements(sql) {
  const clean = String(sql || '')
    .split(/\r?\n/)
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');
  return clean.split(';').map((s) => s.trim()).filter(Boolean);
}

function req(method, p, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(API + p);
    const h = Object.assign({ Authorization: 'Bearer ' + TOKEN }, headers || {});
    let payload = null;
    if (body !== undefined && body !== null) {
      payload = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body), 'utf8');
      if (!h['Content-Type']) { h['Content-Type'] = 'application/json'; }
      h['Content-Length'] = payload.length;
    }
    const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, headers: h }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString('utf8');
        let j = null; try { j = JSON.parse(txt); } catch (e) { }
        resolve({ status: res.statusCode, body: j, text: txt });
      });
    });
    r.on('error', reject);
    if (payload) { r.write(payload); }
    r.end();
  });
}

async function main() {
  if (!TOKEN) { console.error('no CF_TOKEN'); process.exitCode = 1; return; }
  let aid = process.env.CF_ACCOUNT || '';
  if (aid) {
    console.log('account (from CF_ACCOUNT)', aid.slice(0, 6) + '…');
  } else {
    const acc = await req('GET', '/accounts?per_page=50');
    if (acc.status !== 200 || !acc.body || !acc.body.result || !acc.body.result.length) {
      console.log('accounts failed', acc.status, (acc.text || '').slice(0, 200)); process.exit(1);
    }
    aid = acc.body.result[0].id;
  }
  console.log('account ok', aid.slice(0, 6) + '…');

  const dbs = await req('GET', '/accounts/' + aid + '/d1/database?per_page=100');
  const list = (dbs.body && dbs.body.result) || [];
  const db = list.filter((d) => d.name === DB_NAME)[0];
  if (!db) { console.log('db not found:', list.map((d) => d.name).join(',')); process.exit(1); }
  console.log('db', db.name, db.uuid);

  const sql = fs.readFileSync(path.join(DIR, 'schema.sql'), 'utf8');
  const statements = splitSqlStatements(sql);
  for (const st of statements) {
    const r = await req('POST', '/accounts/' + aid + '/d1/database/' + db.uuid + '/query', { sql: st });
    if (r.status !== 200 || !r.body || r.body.success === false) {
      console.log('SQL failed:', st.slice(0, 40), r.status, (r.text || '').slice(0, 200));
    }
  }
  console.log('schema applied');

  const check = await req('POST', '/accounts/' + aid + '/d1/database/' + db.uuid + '/query',
    { sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name" });
  const names = ((check.body && check.body.result && check.body.result[0] && check.body.result[0].results) || []).map((x) => x.name);
  console.log('tables:', names.join(','));
  for (const reqTable of ['state', 'history', 'blob_state', 'blob_history', 'whisper_media']) {
    if (names.indexOf(reqTable) < 0) {
      throw new Error('missing required table after schema apply: ' + reqTable);
    }
  }
  const seedCheck = await req('POST', '/accounts/' + aid + '/d1/database/' + db.uuid + '/query',
    { sql: "SELECT rev FROM blob_state WHERE ns = 'whisper'" });
  const seedRows = (seedCheck.body && seedCheck.body.result && seedCheck.body.result[0] && seedCheck.body.result[0].results) || [];
  if (!seedRows.length) {
    throw new Error("missing blob_state seed row for ns='whisper'");
  }

  const worker = fs.readFileSync(path.join(DIR, 'worker.js'), 'utf8');
  const boundary = '----abbey' + Date.now();
  const meta = {
    main_module: 'worker.js',
    compatibility_date: '2024-06-01',
    /**
     * 上传脚本时如果只列 d1 绑定，Cloudflare 会**删掉**没列出来的绑定 ——
     * 包括 SYNC_TOKEN 这个 secret（secret 的值读不出来，只能别碰它）。
     * keep_bindings 让服务端保留现有的 secret_text 绑定。
     */
    keep_bindings: ['secret_text'],
    bindings: [{ type: 'd1', name: 'DB', id: db.uuid }]
  };
  const parts = [];
  parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n' + JSON.stringify(meta) + '\r\n'));
  parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="worker.js"; filename="worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n'));
  parts.push(Buffer.from(worker));
  parts.push(Buffer.from('\r\n--' + boundary + '--\r\n'));
  const body = Buffer.concat(parts);
  const up = await req('PUT', '/accounts/' + aid + '/workers/scripts/' + SCRIPT, body, { 'Content-Type': 'multipart/form-data; boundary=' + boundary });
  console.log('deploy status', up.status, up.body && up.body.success ? 'success' : (up.text || '').slice(0, 300));

  /* 部署完必须回头确认 SYNC_TOKEN 还在：丢了它，所有客户端都会 401 */
  const st = await req('GET', '/accounts/' + aid + '/workers/scripts/' + SCRIPT + '/settings');
  const bindings = ((st.body && st.body.result && st.body.result.bindings) || []).map((b) => b.name + ':' + b.type);
  console.log('bindings:', bindings.join(', ') || '（读不到）');
  if (bindings.indexOf('SYNC_TOKEN:secret_text') < 0) {
    console.log('!! SYNC_TOKEN 绑定不见了 —— 立刻去控制台补 secret，否则同步全是 401');
    process.exitCode = 1;
  }
}

module.exports = { splitSqlStatements };

if (require.main === module) {
  main().catch((e) => { console.error('ERR', e.message); process.exitCode = 1; });
}
