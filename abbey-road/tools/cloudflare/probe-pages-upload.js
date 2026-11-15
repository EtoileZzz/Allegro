/**
 * Pages 上传诊断：用最小 worker 做对照实验，确定 manifest 格式到底怎么才生效。
 *
 * 用法：
 *   set CF_TOKEN=xxx
 *   node tools/cloudflare/probe-pages-upload.js minimal
 *   node tools/cloudflare/probe-pages-upload.js real
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API = 'https://api.cloudflare.com/client/v4';
const PROJECT = 'abbeyroad-sync';
const TOKEN = process.env.CF_TOKEN || '';
const MODE = process.argv[2] || 'minimal';

const MINIMAL = "export default { async fetch(request) { return new Response('HELLO-PAGES-OK', { status: 200, headers: { 'content-type': 'text/plain' } }); } };\n";

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

async function api(method, p, body, opts) {
  const headers = { Authorization: 'Bearer ' + TOKEN };
  let payload;
  if (Buffer.isBuffer(body)) { payload = body; headers['Content-Type'] = (opts && opts.contentType) || 'application/octet-stream'; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const res = await fetch(API + p, { method, headers, body: payload });
  const t = await res.text();
  let j = null; try { j = JSON.parse(t); } catch (e) { }
  if (!res.ok || (j && j.success === false)) {
    throw new Error(method + ' ' + p + ' → HTTP ' + res.status + ' ' + (j && j.errors ? JSON.stringify(j.errors) : t.slice(0, 300)));
  }
  return j;
}

async function deploy(label, src, opts) {
  const hashAlgo = (opts && opts.hash) || 'sha256';
  const key = (opts && opts.key) || '/_worker.js';
  const partName = (opts && opts.partName) || '/_worker.js';
  const ctype = (opts && opts.ctype) || 'application/javascript+module';
  const hash = crypto.createHash(hashAlgo).update(src, 'utf8').digest('hex');
  const manifest = {};
  manifest[key] = hash;
  if (opts && opts.extra) {
    for (const ek of Object.keys(opts.extra)) {
      manifest[ek] = crypto.createHash(hashAlgo).update(opts.extra[ek], 'utf8').digest('hex');
    }
  }
  const parts = [{ name: 'manifest', data: JSON.stringify(manifest), contentType: 'application/json' }];
  parts.push({ name: partName, filename: key.replace(/^\//, ''), data: src, contentType: ctype });
  if (opts && opts.extra) {
    for (const ek of Object.keys(opts.extra)) {
      parts.push({ name: ek, filename: ek.replace(/^\//, ''), data: opts.extra[ek], contentType: 'text/html' });
    }
  }
  const mp = multipart(parts);
  const before = Date.now();
  const dep = await api('POST', '/accounts/' + (process.env.AID || '') + '/pages/projects/' + PROJECT + '/deployments', mp.body, {
    contentType: 'multipart/form-data; boundary=' + mp.boundary
  });
  return { dep: dep.result, ms: Date.now() - before, manifest };
}

async function probe(url, label) {
  try {
    const r = await fetch(url, { headers: { Origin: 'https://abbeyroad.local' } });
    const t = await r.text();
    return { label, status: r.status, body: t.slice(0, 120).replace(/\s+/g, ' ') };
  } catch (e) { return { label, status: 'ERR', body: e.message }; }
}

(async () => {
  if (!TOKEN) { console.error('set CF_TOKEN'); process.exitCode = 1; return; }
  const accs = await api('GET', '/accounts');
  const AID = (accs.result || [])[0].id;
  process.env.AID = AID;

  const realSrc = fs.readFileSync(path.join(__dirname, 'worker.js'), 'utf8');

  const cases = MODE === 'minimal'
    ? [
        { label: 'A 最小worker /_worker.js + sha256', src: MINIMAL, opts: {} },
        { label: 'B 最小worker 无前导斜杠 + sha256', src: MINIMAL, opts: { key: '_worker.js', partName: '_worker.js' } },
        { label: 'C 最小worker + md5', src: MINIMAL, opts: { hash: 'md5' } },
        { label: 'D 最小worker + 带 index.html', src: MINIMAL, opts: { extra: { '/index.html': '<!doctype html><title>sync</title>' } } }
      ]
    : [
        { label: 'R 真 worker /_worker.js + sha256', src: realSrc, opts: { extra: { '/index.html': '<!doctype html><meta charset="utf-8"><title>Abbey Road Sync</title>' } } }
      ];

  for (const c of cases) {
    try {
      const r = await deploy(c.label, c.src, c.opts);
      console.log('\n[' + c.label + '] 部署成功，' + r.ms + 'ms，id=' + (r.dep && r.dep.id));
      // 等一会儿再看（Pages 传播很快，一般 <5s）
      let got = null;
      for (let i = 0; i < 6; i++) {
        await new Promise((x) => setTimeout(x, 3000));
        got = await probe('https://abbeyroad-sync.pages.dev/health', c.label);
        if (got.status === 200) { break; }
      }
      console.log('   /health →', got.status, got.body);
      const w = await probe('https://abbeyroad-sync.pages.dev/_worker.js', c.label + ' worker.js');
      console.log('   /_worker.js →', w.status, w.body.slice(0, 60));
    } catch (e) {
      console.log('\n[' + c.label + '] 部署失败：' + e.message);
    }
  }
})();
