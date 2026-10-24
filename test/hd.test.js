// Kiểm thử máy chủ của https://huydinh.app/cotuong/: chuyển hướng trang cũ, chặn nguồn lạ, ghép bàn, nước đi, đồng hồ,
// chat, tín hiệu mic, vào lại ghế, đăng nhập Google (giả lập) + lưu câu nói nhanh theo tài khoản.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { createServer } = require('../server');
const { JsonStore } = require('../lib/store');

let srv, base, wsBase, google, gBase;
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hd-')), 'users.json');
test.before(async () => {
  google = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/token')) return res.end(JSON.stringify({ access_token: 'at' }));
    if (req.url.startsWith('/me')) return res.end(JSON.stringify({ sub: 'g-1', name: 'Huy', email: 'huy@example.com', picture: 'https://lh3.example/a.png' }));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(r => google.listen(0, r)); gBase = 'http://127.0.0.1:' + google.address().port;
  srv = createServer({ USERS_FILE: file, SESSION_SECRET: 's', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'cs',
    GOOGLE_AUTH_URL: gBase + '/auth', GOOGLE_TOKEN_URL: gBase + '/token', GOOGLE_USERINFO_URL: gBase + '/me' });
  await srv.ready;
  await new Promise(r => srv.server.listen(0, r));
  base = 'http://127.0.0.1:' + srv.server.address().port; wsBase = base.replace('http', 'ws') + '/hd';
});
test.after(() => { srv.server.close(); google.close(); setImmediate(() => process.exit(0)); });

function client(origin = 'https://huydinh.app') {
  const ws = new WebSocket(wsBase, { origin }); const msgs = [];
  ws.on('message', d => msgs.push(JSON.parse(d)));
  ws.wait = (pred, ms = 3000) => new Promise((res, rej) => {
    const t0 = Date.now(); (function poll() { const i = msgs.findIndex(pred); if (i >= 0) return res(msgs.splice(i, 1)[0]); if (Date.now() - t0 > ms) return rej(new Error('timeout')); setTimeout(poll, 10); })();
  });
  ws.j = m => ws.send(JSON.stringify(m)); ws.msgs = msgs;
  return new Promise((res, rej) => { ws.on('open', () => res(ws)); ws.on('error', rej); });
}
async function pair(tc) {
  const a = await client(), b = await client();
  a.j({ type: 'hello', name: 'A' }); b.j({ type: 'hello', name: 'B' });
  a.j({ type: 'queue', variant: 'std', tc }); b.j({ type: 'queue', variant: 'std', tc });
  const ma = await a.wait(m => m.type === 'matched'), mb = await b.wait(m => m.type === 'matched');
  const red = ma.you === 'r' ? a : b, black = red === a ? b : a;
  return { a, b, ma, mb, red, black, rm: red === a ? ma : mb };
}

test('trang cũ cotuongvn.net -> 301 về huydinh.app/cotuong, trang pháp lý vẫn còn', async () => {
  for (const p of ['/', '/index.html', '/r/ABC123', '/app.js', '/bat-ky']) {
    const r = await fetch(base + p, { redirect: 'manual' });
    assert.equal(r.status, 301, p); assert.equal(r.headers.get('location'), 'https://huydinh.app/cotuong/');
  }
  for (const p of ['/privacy', '/terms', '/data-deletion', '/en/privacy']) assert.equal((await fetch(base + p)).status, 200, p);
  const h = await (await fetch(base + '/health')).json(); assert.equal(h.ok, true);
});

test('WebSocket: chỉ nhận huydinh.app / huydinh.info, chặn nguồn lạ và đường dẫn cũ /ws', async () => {
  for (const o of ['https://huydinh.app', 'https://huydinh.info']) (await client(o)).close();
  await assert.rejects(client('https://cotuongvn.net'));
  await assert.rejects(client('https://evil.example'));
  await assert.rejects(new Promise((res, rej) => { const w = new WebSocket(base.replace('http', 'ws') + '/ws', { origin: 'https://huydinh.app' }); w.on('open', res); w.on('error', rej); }));
});

test('ghép bàn tự động, mặc định cờ tiêu chuẩn 60 phút + 30 giây, đi quân, chat, mic, cầu hoà', async () => {
  const { a, b, red, black } = await pair();
  const s = await red.wait(m => m.type === 'state');
  assert.equal(s.tc, 'std'); assert.equal(s.inc, 30e3); assert.equal(s.clock.r, 3600e3);
  red.j({ type: 'move', from: s.moves[0][0], to: s.moves[0][1] });
  const sb = await black.wait(m => m.type === 'state' && m.moveCount === 1);
  assert.equal(sb.turn, 'b');
  red.j({ type: 'chat', text: 'Chào bạn' });
  assert.equal((await black.wait(m => m.type === 'chat')).text, 'Chào bạn');
  red.j({ type: 'rtc', data: { mic: true } });
  assert.deepEqual((await black.wait(m => m.type === 'rtc')).data, { mic: true });
  red.j({ type: 'draw_offer' }); await black.wait(m => m.type === 'state' && m.offer === 'r');
  black.j({ type: 'draw_reply', accept: true });
  const end = await red.wait(m => m.type === 'state' && m.over);
  assert.equal(end.over.reason, 'agreed'); a.close(); b.close();
});

test('chỉ ghép người cùng mức thời gian; cờ chớp 5 phút + 3 giây', async () => {
  const x = await client(), y = await client();
  x.j({ type: 'queue', tc: 'blitz' }); y.j({ type: 'queue', tc: 'rapid' });
  await x.wait(m => m.type === 'queued'); await y.wait(m => m.type === 'queued');
  await new Promise(r => setTimeout(r, 100));
  assert.ok(!x.msgs.some(m => m.type === 'matched'));
  x.close(); y.close();
  const { a, b, red } = await pair('blitz');
  const s = await red.wait(m => m.type === 'state'); assert.equal(s.clock.r, 300e3); assert.equal(s.inc, 3e3);
  a.close(); b.close();
});

test('tải lại trang giữa ván: vào lại đúng ghế bằng token; xin thua', async () => {
  const { a, b, red, black, rm } = await pair();
  red.close();
  const back = await client(); back.j({ type: 'hello', name: 'A', resume: { id: rm.id, side: rm.you, token: rm.token } });
  const st = await back.wait(m => m.type === 'state' && m.you === rm.you);
  assert.equal(st.id, rm.id);
  back.j({ type: 'resign' });
  const e = await black.wait(m => m.type === 'state' && m.over); assert.equal(e.over.reason, 'resign');
  back.close(); black.close();
});

test('đăng nhập Google (popup) -> mã -> WebSocket login, lưu câu nói nhanh theo tài khoản', async () => {
  const r1 = await fetch(base + '/auth/hd/start', { redirect: 'manual' });
  assert.equal(r1.status, 302);
  const loc = new URL(r1.headers.get('location'));
  assert.equal(loc.searchParams.get('client_id'), 'cid');
  assert.equal(loc.searchParams.get('redirect_uri'), base + '/auth/google/callback');
  const cookie = r1.headers.get('set-cookie').split(';')[0];
  const r2 = await fetch(base + '/auth/google/callback?code=c&state=' + loc.searchParams.get('state'), { headers: { cookie }, redirect: 'manual' });
  assert.equal(r2.headers.get('location'), '/auth/hd/done');
  const sess = r2.headers.get('set-cookie').match(/ct_session=[^;]+/)[0];
  const html = await (await fetch(base + '/auth/hd/done', { headers: { cookie: sess } })).text();
  assert.match(html, /https:\/\/huydinh\.app/); assert.match(html, /huydinh\.app\/cotuong\//);
  const token = JSON.parse(html.match(/var t=("[^"]*")/)[1]); assert.ok(token);
  const w = await client(); w.j({ type: 'login', token });
  const acc = await w.wait(m => m.type === 'account'); assert.equal(acc.user.name, 'Huy'); assert.equal(acc.user.email, 'huy@example.com'); assert.equal(acc.user.avatar, 'https://lh3.example/a.png'); assert.equal(acc.prefs, null);
  w.j({ type: 'prefs_set', data: { phrases: ['Chào', 'Hay quá'], name: 'Huy' } });
  await w.wait(m => m.type === 'prefs_saved'); w.close();
  const w2 = await client(); w2.j({ type: 'login', token });
  assert.deepEqual((await w2.wait(m => m.type === 'account')).prefs.phrases, ['Chào', 'Hay quá']);
  w2.j({ type: 'login', token: token + 'x' }); assert.equal((await w2.wait(m => m.type === 'account')).error, 'token');
  w2.close();
  // sai state -> không đăng nhập
  const bad = await fetch(base + '/auth/google/callback?code=c&state=sai', { headers: { cookie }, redirect: 'manual' });
  assert.ok(!/ct_session=[^;]/.test(bad.headers.get('set-cookie') || ''));
});

test('kho JSON giữ dữ liệu cũ khi ghi lại', async () => {
  const f = path.join(path.dirname(file), 'old.json');
  fs.writeFileSync(f, JSON.stringify({ users: [], messages: [{ id: 1 }], blocks: [] }));
  const s = await new JsonStore(f).init();
  const u = await s.upsertOAuthUser({ provider: 'google', providerId: 'x', name: 'N' });
  assert.equal(await s.setPrefs(u.id, { phrases: ['a'] }), true); await s.close();
  const d = JSON.parse(fs.readFileSync(f, 'utf8')); assert.deepEqual(d.messages, [{ id: 1 }]); assert.equal(d.users.length, 1);
});
