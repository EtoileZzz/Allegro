/**
 * Abbey Road · 改用 Cloudflare Pages 部署同步后端
 *
 * 为什么不在 workers.dev 上：
 *   实测 `*.workers.dev` 在本网络被 DNS 投毒（四个公共 DNS 各回一个不同假 IP），
 *   而 `*.pages.dev` 解析到真实 Cloudflare 边缘（104.18.x.x）且 HTTPS 可达。
 *   Pages 的「Advanced mode」允许整站就一个 `_worker.js`，代码与 Worker 完全一致，
 *   同样能绑 D1、同样有 Secret，同样免费、同样不需要域名。
 *
 * 用法：
 *   set CF_TOKEN=xxx
 *   node tools/cloudflare/deploy-pages.js
 *
 * 可选：CF_ACCOUNT / SYNC_TOKEN / DRY=1
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API = 'https://api.cloudflare.com/client/v4';
const PROJECT = 'abbeyroad-sync';
const DB_NAME = 'abbeyroad-sync';
const WORKER_FILE = path.join(__dirname, 'worker.js');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

const TOKEN = process.env.CF_TOKEN || process.env.CLOUDFLARE_API_TOKEN || '';
const DRY = process.env.DRY === '1';
let SYNC_TOKEN = process.env.SYNC_TOKEN || '';
const GENERATED = !SYNC_TOKEN;

class FatalError extends Error {}
const log = (m) => console.log(m);
function fail(m) { console.error('\n✗ ' + m); process.exitCode = 1; throw new FatalError(m); }

async function api(method, p, body, opts) {
  const headers = { Authorization: 'Bearer ' + TOKEN };
  let payload;
  if (Buffer.isBuffer(body)) {
    payload = body;
    headers['Content-Type'] = (opts && opts.contentType) || 'application/octet-stream';
  } else if (body !== undefined && body !== null) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  if (DRY && method !== 'GET') { log('  [dry] ' + method + ' ' + p); return { success: true, result: null }; }
  const res = await fetch(API + p, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
  if (!res.ok || (data && data.success === false)) {
    const errs = data && data.errors ? JSON.stringify(data.errors) : text.slice(0, 400);
    const e = new Error(method + ' ' + p + ' → HTTP ' + res.status + ' ' + errs);
    e.status = res.status; e.data = data;
    throw e;
  }
  return data;
}

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
  if (!TOKEN) { fail('缺少 token：set CF_TOKEN=...'); }
  log('== Abbey Road 同步后端部署（Cloudflare Pages）==' + (DRY ? '（DRY）' : ''));

  /* 账号 */
  const accs = await api('GET', '/accounts');
  const list = accs.result || [];
  if (!list.length) { fail('token 看不到账号（检查 Account Resources）'); }
  const acc = process.env.CF_ACCOUNT
    ? list.find((a) => String(a.id) === process.env.CF_ACCOUNT || String(a.name || '').toLowerCase().includes(process.env.CF_ACCOUNT.toLowerCase()))
    : list[0];
  if (!acc) { fail('找不到账号'); }
  const AID = acc.id;
  log('1) 账号：' + acc.name + ' (' + AID + ')');

  /* D1（之前已经建好了，直接复用；没有就建） */
  let dbId = null;
  const dbs = await api('GET', '/accounts/' + AID + '/d1/database');
  const db = (dbs.result || []).find((d) => d.name === DB_NAME);
  if (db) {
    dbId = db.uuid || db.id;
    log('2) D1 复用：' + DB_NAME + ' (' + dbId + ')');
  } else {
    const c = await api('POST', '/accounts/' + AID + '/d1/database', { name: DB_NAME });
    dbId = (c.result || {}).uuid || (c.result || {}).id;
    log('2) D1 新建：' + dbId);
    const schema = fs.readFileSync(SCHEMA_FILE, 'utf8').split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join('\n');
    for (const sql of schema.split(';').map((s) => s.trim()).filter(Boolean)) {
      await api('POST', '/accounts/' + AID + '/d1/database/' + dbId + '/query', { sql });
    }
    log('   建表完成');
  }

  /* Pages 项目 */
  let project = null;
  try {
    const got = await api('GET', '/accounts/' + AID + '/pages/projects/' + PROJECT);
    project = got.result;
    log('3) Pages 项目已存在：' + project.name + '  (' + (project.subdomain || '') + ')');
  } catch (e) {
    if (e.status !== 404) { throw e; }
    const made = await api('POST', '/accounts/' + AID + '/pages/projects', { name: PROJECT, production_branch: 'main' });
    project = made.result;
    log('3) Pages 项目已创建：' + project.name);
  }

  /* 绑定 D1 + Secret（写在 deployment_configs 里，下次部署生效） */
  if (!SYNC_TOKEN) { SYNC_TOKEN = crypto.randomBytes(32).toString('hex'); }
  const cfg = {
    deployment_configs: {
      production: {
        d1_databases: { DB: { id: dbId } },
        env_vars: { SYNC_TOKEN: { type: 'secret_text', value: SYNC_TOKEN } }
      }
    }
  };
  await api('PATCH', '/accounts/' + AID + '/pages/projects/' + PROJECT, cfg);
  log('4) 绑定已写入：DB → ' + DB_NAME + '，SYNC_TOKEN（secret）');

  /* 部署：Advanced mode 只要一个 _worker.js
     ⚠ manifest 的键**不能**带前导斜杠：写成 "/_worker.js" 时 Pages 会把它当普通静态资源，
     结果是 /health 404、/_worker.js 500（实测踩过）；写成 "_worker.js" 才会被认成脚本入口。 */
  const src = fs.readFileSync(WORKER_FILE, 'utf8');
  const hash = crypto.createHash('sha256').update(src, 'utf8').digest('hex');
  const manifest = { '_worker.js': hash };
  const mp = multipart([
    { name: 'manifest', data: JSON.stringify(manifest), contentType: 'application/json' },
    { name: '_worker.js', filename: '_worker.js', data: src, contentType: 'application/javascript+module' }
  ]);
  const dep = await api('POST', '/accounts/' + AID + '/pages/projects/' + PROJECT + '/deployments', mp.body, {
    contentType: 'multipart/form-data; boundary=' + mp.boundary
  });
  const d = dep.result || {};
  log('5) 已部署：id=' + (d.id || '?') + '  url=' + (d.url || '?') + '  stage=' + (d.stage || '?'));

  const url = 'https://' + PROJECT + '.pages.dev';

  /* 验收 */
  log('\n6) 等待生效并验收 ' + url + '/health ...');
  let health = null;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const r = await fetch(url + '/health', { headers: { Origin: 'https://abbeyroad.local' } });
      const txt = await r.text();
      try { health = JSON.parse(txt); } catch (e) { health = { status: r.status, raw: txt.slice(0, 160) }; }
      if (health && health.ok) { break; }
      log('   … ' + (health.raw ? 'HTTP ' + health.status + ' ' + health.raw : JSON.stringify(health)));
    } catch (e) {
      health = { error: e.message };
      log('   … ' + e.message);
    }
  }

  let authStatus = 'n/a';
  try {
    const r = await fetch(url + '/state');
    authStatus = 'HTTP ' + r.status;
  } catch (e) { authStatus = 'ERR ' + e.message; }

  log('\n================ 结果 ================');
  log('服务地址    : ' + url);
  log('/health     : ' + JSON.stringify(health));
  log('/state 无token: ' + authStatus + '（应为 401）');
  log('SYNC_TOKEN  : ' + SYNC_TOKEN + (GENERATED ? '   ← 新生成，请抄走' : '   ← 你指定的'));
  log('======================================');
  if (!health || !health.ok) {
    log('\n⚠ /health 未通过。若返回 500 且 detail 提到 DB，说明 D1 绑定没进这次部署 ——');
    log('  再跑一次本脚本（绑定在上一次 PATCH 里，重新部署就会带上）。');
  }
  log('\n把「服务地址」和「SYNC_TOKEN」填进 App：设置 → 数据与同步 → 云同步');
  log('worker.js 以后要改，就用本脚本重新部署一次即可。');
  log('配完后建议把这次用的 Cloudflare API Token 删掉。');
}

main().catch((e) => {
  if (e instanceof FatalError) { return; }
  console.error('\n✗ ' + (e && e.message ? e.message : String(e)));
  process.exitCode = 1;
});
