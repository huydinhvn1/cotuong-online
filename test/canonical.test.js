// Chuyển hướng 301 từ tên miền cũ (onrender.com) về PUBLIC_URL (https://cotuongvn.net).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { canonicalRedirect, hostName } = require('../lib/canonical');

const PORT = 3983, OLD = 'cotuong-online-6qpn.onrender.com', PUB = 'https://cotuongvn.net';
let srv;

test.before(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-canon-'));
  const env = { ...process.env, PORT: String(PORT), PUBLIC_URL: PUB + '/', USERS_FILE: path.join(tmp, 'users.json') };
  for (const k of ['DATABASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET']) delete env[k];
  srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((ok, bad) => {
    const t = setTimeout(() => bad(new Error('server không khởi động')), 8000);
    srv.stdout.on('data', d => { if (String(d).includes('đang chạy')) { clearTimeout(t); ok(); } });
  });
});
test.after(() => { if (srv) srv.kill(); });

// http.request để tự đặt header Host (fetch không cho đổi Host)
function req(method, p, host, headers = {}) {
  return new Promise((ok, bad) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: { host, ...headers } }, res => {
      let body = ''; res.on('data', d => body += d); res.on('end', () => ok({ status: res.statusCode, location: res.headers.location, body }));
    });
    r.on('error', bad); r.end();
  });
}

test('GET/HEAD trên tên miền cũ -> 301 về PUBLIC_URL, giữ đường dẫn + truy vấn (link phòng /r/MÃ)', async () => {
  for (const [p, want] of [
    ['/', PUB + '/'],
    ['/r/ABC123', PUB + '/r/ABC123'],
    ['/r/ABC123?ref=zalo&x=1%202', PUB + '/r/ABC123?ref=zalo&x=1%202'],
    ['/chinh-sach-bao-mat', PUB + '/chinh-sach-bao-mat'],
    ['/en/privacy', PUB + '/en/privacy'],
    ['//evil.example/x', PUB + '//evil.example/x'], // luôn ở lại tên miền chính
  ]) {
    const r = await req('GET', p, OLD);
    assert.equal(r.status, 301, p); assert.equal(r.location, want, p);
    assert.equal(new URL(r.location).host, 'cotuongvn.net');
  }
  const h = await req('HEAD', '/r/ZZZ999?a=b', OLD + ':443');
  assert.equal(h.status, 301); assert.equal(h.location, PUB + '/r/ZZZ999?a=b');
  const www = await req('GET', '/r/Q1', 'www.cotuongvn.net');
  assert.equal(www.status, 301); assert.equal(www.location, PUB + '/r/Q1');
});

test('Đúng tên miền, localhost/127.0.0.1, health check, POST, WebSocket: không chuyển hướng', async () => {
  for (const host of ['cotuongvn.net', 'CotuongVN.net', 'cotuongvn.net:443', 'localhost:' + PORT, '127.0.0.1:' + PORT, '[::1]:' + PORT, '10.0.3.7:' + PORT]) {
    const r = await req('GET', '/r/ABC123', host);
    assert.equal(r.status, 200, host); assert.match(r.body, /<html/);
  }
  const hc = await req('GET', '/health', OLD); // Render gọi /health
  assert.equal(hc.status, 200); assert.equal(JSON.parse(hc.body).ok, true);
  const ua = await req('GET', '/', OLD, { 'user-agent': 'Render/1.0' });
  assert.equal(ua.status, 200);
  const post = await req('POST', '/api/blocks/x', OLD, { 'content-length': '0' });
  assert.notEqual(post.status, 301);
  // nâng cấp WebSocket trên tên miền cũ vẫn kết nối được (client đang mở trang cũ không bị rớt)
  const status = await new Promise((ok, bad) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: '/ws', headers: { host: OLD, connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': crypto.randomBytes(16).toString('base64'), origin: 'https://' + OLD } });
    r.on('upgrade', (res, sock) => { sock.destroy(); ok(res.statusCode); });
    r.on('response', res => ok(res.statusCode));
    r.on('error', bad); r.end();
  });
  assert.equal(status, 101);
});

test('Không đặt PUBLIC_URL (hoặc sai) -> không chuyển hướng; tách tên máy khỏi Host', () => {
  const run = (mw, r) => { let next = false, red = null; mw({ method: 'GET', path: '/', originalUrl: '/', headers: { host: OLD }, ...r }, { set() {}, redirect: (c, u) => { red = [c, u]; } }, () => { next = true; }); return { next, red }; };
  for (const v of [undefined, '', 'not a url', 'ftp://x.y']) assert.deepEqual(run(canonicalRedirect(v), {}), { next: true, red: null }, String(v));
  const mw = canonicalRedirect('https://cotuongvn.net');
  assert.deepEqual(run(mw, { originalUrl: '/r/AB?x=1' }).red, [301, 'https://cotuongvn.net/r/AB?x=1']);
  assert.equal(run(mw, { method: 'OPTIONS' }).next, true);
  assert.equal(run(mw, { headers: { host: OLD, upgrade: 'websocket', connection: 'Upgrade' } }).next, true);
  assert.equal(run(mw, { headers: {} }).next, true);
  assert.equal(hostName('Example.COM:8080'), 'example.com'); assert.equal(hostName('[::1]:3000'), '::1'); assert.equal(hostName('localhost'), 'localhost');
});
