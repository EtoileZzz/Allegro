/**
 * Abbey Road · Cloudflare 云同步一键部署（Node，零依赖）
 *
 * 做的事（全部走 api.cloudflare.com，就是你在网页上点的那 7 步）：
 *   1. 取 account id
 *   2. 建 D1 数据库 abbeyroad-sync（已存在则复用）
 *   3. 逐条执行 schema.sql
 *   4. 上传 worker.js（ES module）
 *   5. 绑定 D1 → 变量名 DB
 *   6. 写入 Secret：SYNC_TOKEN（没给就随机生成并打印一次）
 *   7. 打开/确认 workers.dev 子域
 *   8. 请求 /health 验收
 *
 * 用法（token 只放环境变量，不进命令行历史、不写文件）：
 *   set CF_TOKEN=xxxxx
 *   node tools/cloudflare/deploy.js
 *
 * 可选环境变量：
 *   CF_ACCOUNT     账号 id 或名字片段（多账号时用来挑）
 *   SYNC_TOKEN     指定同步令牌（不指定就随机生成）
 *   SUBDOMAIN      想要的 workers.dev 子域（默认 abbeyroad）
 *   DRY=1          只打印计划，不发写请求
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const API = 'https://api.cloudflare.com/client/v4';
const DB_NAME = 'abbeyroad-sync';
const SCRIPT_NAME = 'abbeyroad-sync';
const WORKER_FILE = path.join(__dirname, 'worker.js');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

const TOKEN = process.env.CF_TOKEN || process.env.CLOUDFLARE_API_TOKEN || '';
const DRY = process.env.DRY === '1';
const WANT_SUBDOMAIN = (process.env.SUBDOMAIN || 'abbeyroad').toLowerCase();
let SYNC_TOKEN = process.env.SYNC_TOKEN || '';
const GENERATED_TOKEN = !SYNC_TOKEN;

function log(msg) { console.log(msg); }
/** 致命错误：只设 exitCode 并抛出，**不要** process.exit() —— 
    在 Windows 上带着未关闭的 fetch 连接硬退出会触发 libuv 断言噪音。 */
class FatalError extends Error {}
function fail(msg) { console.error('\n✗ ' + msg); process.exitCode = 1; throw new FatalError(msg); }

async function api(method, p, body, opts) {
  const url = API + p;
  const headers = { Authorization: 'Bearer ' + TOKEN };
  let payload = null;
  if (body !== undefined && body !== null) {
    if (Buffer.isBuffer(body)) {
      payload = body;
      headers['Content-Type'] = (opts && opts.contentType) || 'application/octet-stream';
    } else {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
  }
  if (DRY && method !== 'GET') {
    log('  [dry] ' + method + ' ' + p + '  ' + (body && !Buffer.isBuffer(body) ? JSON.stringify(body).slice(0, 140) : '<binary>'));
    return { success: true, result: null };
  }
  const res = await fetch(url, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
  if (!res.ok || (data && data.success === false)) {
    const errs = (data && data.errors) ? JSON.stringify(data.errors) : text.slice(0, 300);
    const e = new Error(method + ' ' + p + ' → HTTP ' + res.status + ' ' + errs);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data;
}

/** 手搓 multipart：这台机器上 undici 的 FormData 有坑，用 Buffer 直发最稳 */
function multipart(parts) {
  const boundary = '----abbeyroad' + crypto.randomBytes(12).toString('hex');
  const chunks = [];
  for (const p of parts) {
    chunks.push(Buffer.from('--' + boundary + '\r\n'));
    let disp = 'Content-Disposition: form-data; name="' + p.name + '"';
    if (p.filename) { disp += '; filename="' + p.filename + '"'; }
    chunks.push(Buffer.from(disp + '\r\n'));
    if (p.contentType) { chunks.push(Buffer.from('Content-Type: ' + p.contentType + '\r\n')); }
    chunks.push(Buffer.from('\r\n'));
    chunks.push(Buffer.isBuffer(p.data) ? p.data : Buffer.from(String(p.data), 'utf8'));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from('--' + boundary + '--\r\n'));
  return { body: Buffer.concat(chunks), boundary };
}

async function main() {
  if (!TOKEN) {
    fail('缺少 token。请先：set CF_TOKEN=... 然后再跑本脚本（token 只在环境变量里，不写文件）');
  }
  log('== Abbey Road 云同步部署 ==' + (DRY ? '（DRY 模式，不会真的改云端）' : ''));

  /* ── 1. 账号 ── */
  const accs = await api('GET', '/accounts');
  const list = (accs.result || []);
  if (!list.length) { fail('这个 token 看不到任何账号，检查 Account Resources 是否 Include 了你的账号'); }
  let acc = list[0];
  if (process.env.CF_ACCOUNT) {
    const want = process.env.CF_ACCOUNT.toLowerCase();
    acc = list.find((a) => String(a.id).toLowerCase() === want || String(a.name || '').toLowerCase().includes(want));
    if (!acc) { fail('找不到指定的账号：' + process.env.CF_ACCOUNT + '（可用：' + list.map((a) => a.name).join(' / ') + '）'); }
  }
  const AID = acc.id;
  log('1) 账号：' + acc.name + '  (' + AID + ')');

  /* ── 2. D1 数据库 ── */
  let dbId = null, dbName = null;
  const dbs = await api('GET', '/accounts/' + AID + '/d1/database');
  const found = (dbs.result || []).find((d) => d.name === DB_NAME);
  if (found) {
    dbId = found.uuid || found.id; dbName = found.name;
    log('2) D1 已存在，复用：' + dbName + '  (' + dbId + ')');
  } else {
    const created = await api('POST', '/accounts/' + AID + '/d1/database', { name: DB_NAME });
    const r = created.result || {};
    dbId = r.uuid || r.id; dbName = r.name || DB_NAME;
    log('2) D1 已创建：' + dbName + '  (' + dbId + ')');
  }
  if (!dbId) { fail('拿不到 D1 database id'); }

  /* ── 3. 建表 ── */
  const schema = fs.readFileSync(SCHEMA_FILE, 'utf8')
    .split(/\r?\n/)
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');
  const stmts = schema.split(';').map((s) => s.trim()).filter(Boolean);
  log('3) 执行 ' + stmts.length + ' 条建表语句');
  for (const sql of stmts) {
    await api('POST', '/accounts/' + AID + '/d1/database/' + dbId + '/query', { sql: sql });
  }
  log('   建表完成');
  if (DRY) { log('\nDRY 结束。'); return; }

  /* ── 4. 上传 Worker ── */
  const workerSrc = fs.readFileSync(WORKER_FILE, 'utf8');
  const metadata = {
    main_module: 'worker.js',
    compatibility_date: '2024-11-01',
    bindings: [{ type: 'd1', name: 'DB', id: dbId }]
  };
  const mp = multipart([
    { name: 'metadata', data: JSON.stringify(metadata), contentType: 'application/json' },
    { name: 'worker.js', filename: 'worker.js', data: workerSrc, contentType: 'application/javascript+module' }
  ]);
  await api('PUT', '/accounts/' + AID + '/workers/scripts/' + SCRIPT_NAME, mp.body, {
    contentType: 'multipart/form-data; boundary=' + mp.boundary
  });
  log('4) Worker 已上传（含 D1 绑定 metadata）');

  /* ── 5. 绑定时再确认一次（metadata 里已带，这里兜底 /settings） ── */
  try {
    await api('PUT', '/accounts/' + AID + '/workers/scripts/' + SCRIPT_NAME + '/settings', {
      bindings: [{ type: 'd1', name: 'DB', id: dbId }],
      compatibility_date: '2024-11-01'
    });
    log('5) 绑定确认：DB → ' + dbName);
  } catch (e) {
    log('5) 绑定兜底请求失败（metadata 里已带绑定，通常不影响）：' + e.message);
  }

  /* ── 6. Secret ── */
  if (!SYNC_TOKEN) { SYNC_TOKEN = crypto.randomBytes(32).toString('hex'); }
  await api('PUT', '/accounts/' + AID + '/workers/scripts/' + SCRIPT_NAME + '/secrets', {
    name: 'SYNC_TOKEN', text: SYNC_TOKEN, type: 'secret_text'
  });
  log('6) Secret SYNC_TOKEN 已写入');

  /* ── 7. workers.dev 子域 ── */
  let sub = null;
  try {
    const cur = await api('GET', '/accounts/' + AID + '/workers/subdomain');
    sub = (cur.result || {}).subdomain || null;
  } catch (e) {
    log('7) 读取子域失败（继续）：' + e.message);
  }
  if (!sub) {
    for (const candidate of [WANT_SUBDOMAIN, WANT_SUBDOMAIN + '-' + crypto.randomBytes(2).toString('hex')]) {
      try {
        await api('PUT', '/accounts/' + AID + '/workers/subdomain', { subdomain: candidate });
        sub = candidate;
        break;
      } catch (e) {
        log('   子域 ' + candidate + ' 不可用：' + e.message);
      }
    }
  }
  if (!sub) { fail('拿不到 workers.dev 子域，请到控制台 Settings → Domains & Routes 手动开一次'); }
  log('7) workers.dev 子域：' + sub);

  // 打开这个脚本的 workers.dev 路由
  try {
    await api('POST', '/accounts/' + AID + '/workers/scripts/' + SCRIPT_NAME + '/subdomain', { enabled: true });
    log('   已开启 ' + SCRIPT_NAME + '.' + sub + '.workers.dev');
  } catch (e) {
    log('   开启路由返回：' + e.message + '（若 /health 能通就无所谓）');
  }

  const url = 'https://' + SCRIPT_NAME + '.' + sub + '.workers.dev';

  /* ── 8. 验收 ── */
  log('\n8) 等待部署生效并验收 /health ...');
  let health = null;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const r = await fetch(url + '/health', { headers: { Origin: 'https://abbeyroad.local' } });
      const j = await r.json();
      health = j;
      if (j && j.ok) { break; }
    } catch (e) {
      health = { error: e.message };
    }
    log('   … 还没通（' + (health && (health.error || JSON.stringify(health))) + '）');
  }

  const authCheck = await (async () => {
    try {
      const r = await fetch(url + '/state');
      return r.status;
    } catch (e) { return 'ERR ' + e.message; }
  })();

  log('\n================ 部署结果 ================');
  log('服务地址   : ' + url);
  log('/health    : ' + JSON.stringify(health));
  log('/state 无token: HTTP ' + authCheck + '（应为 401）');
  log('SYNC_TOKEN : ' + SYNC_TOKEN + (GENERATED_TOKEN ? '   ← 新生成，请抄进密码管理器' : '   ← 你指定的'));
  log('==========================================');
  if (!health || !health.ok || health.db !== true) {
    log('\n⚠ /health 没通过。最常见原因：D1 绑定变量名不是 DB，或部署还在传播。');
    log('  可以等 30 秒再手动打开一次：' + url + '/health');
  }
  log('\n把「服务地址」和「SYNC_TOKEN」填进 App 的设置 → 数据与同步 → 云同步。');
  log('配完后建议去 Cloudflare 把这次用的 API Token 删掉（它只在这个脚本里用过，不需要长期保留）。');
}

main().catch((e) => {
  if (e instanceof FatalError) { return; }
  console.error('\n✗ ' + (e && e.message ? e.message : String(e)));
  process.exitCode = 1;
});
