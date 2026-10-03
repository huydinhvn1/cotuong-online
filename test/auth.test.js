// Kiểm thử đăng nhập Google/Facebook với máy chủ OAuth giả (token + userinfo), phiên cookie, thống kê ván online.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 3996, MOCK = 3997, BASE = `http://localhost:${PORT}`, MB = `http://localhost:${MOCK}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-auth-'));
const ENV = {
  GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', FACEBOOK_APP_ID: 'fid', FACEBOOK_APP_SECRET: 'fsecret',
  SESSION_SECRET: 'test-secret', PUBLIC_URL: BASE, USERS_FILE: path.join(tmp, 'users.json'),
  GOOGLE_AUTH_URL: MB + '/g/auth', GOOGLE_TOKEN_URL: MB + '/g/token', GOOGLE_USERINFO_URL: MB + '/g/userinfo',
  FACEBOOK_AUTH_URL: MB + '/f/auth', FACEBOOK_TOKEN_URL: MB + '/f/token', FACEBOOK_ME_URL: MB + '/f/me',
};

// ---------- Máy chủ OAuth giả ----------
const PROFILES = {
  google: { 'code-huy': { sub: 'g-1', name: 'Huy Google', picture: 'https://lh3.example/huy.png' }, 'code-minh': { sub: 'g-2', name: 'Minh', picture: '' } },
  facebook: { 'code-lan': { id: 'f-9', name: 'Lan Facebook', picture: { data: { url: 'https://fb.example/lan.jpg', is_silhouette: false } } } },
};
const challenges = new Map(); // state -> code_challenge (Google PKCE)
const calls = [];
let mock;
function startMock() {
  mock = http.createServer((req, res) => {
    const u = new URL(req.url, MB); let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      calls.push(u.pathname);
      const json = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (u.pathname === '/g/token') {
        const f = new URLSearchParams(body), code = f.get('code');
        if (req.method !== 'POST' || f.get('client_id') !== 'gid' || f.get('client_secret') !== 'gsecret' || f.get('grant_type') !== 'authorization_code' ||
            f.get('redirect_uri') !== BASE + '/auth/google/callback' || !PROFILES.google[code]) return json(400, { error: 'invalid_grant' });
        const ch = crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64url');
        if (![...challenges.values()].includes(ch)) return json(400, { error: 'invalid_grant', error_description: 'PKCE' });
        return json(200, { access_token: 'gat-' + code, token_type: 'Bearer' });
      }
      if (u.pathname === '/g/userinfo') {
        const m = /^Bearer gat-(.+)$/.exec(req.headers.authorization || '');
        return m && PROFILES.google[m[1]] ? json(200, PROFILES.google[m[1]]) : json(401, { error: 'unauthorized' });
      }
      if (u.pathname === '/f/token') {
        const q = u.searchParams, code = q.get('code');
        if (q.get('client_id') !== 'fid' || q.get('client_secret') !== 'fsecret' || q.get('redirect_uri') !== BASE + '/auth/facebook/callback' || !PROFILES.facebook[code]) return json(400, { error: { message: 'bad code' } });
        return json(200, { access_token: 'fat-' + code, token_type: 'bearer' });
      }
      if (u.pathname === '/f/me') {
        const q = u.searchParams, tok = q.get('access_token') || '', code = tok.replace(/^fat-/, '');
        const proof = crypto.createHmac('sha256', 'fsecret').update(tok).digest('hex');
        if (q.get('appsecret_proof') !== proof || !PROFILES.facebook[code] || !/picture/.test(q.get('fields'))) return json(400, { error: { message: 'bad proof' } });
        return json(200, PROFILES.facebook[code]);
      }
      json(404, {});
    });
  });
  return new Promise(r => mock.listen(MOCK, r));
}

function startServer(port, env) {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, ...env, PORT: port } });
  p.stderr.on('data', d => { if (process.env.DEBUG_AUTH) process.stderr.write(d); });
  return new Promise(r => p.stdout.on('data', d => /đang chạy/.test(d) && r(p)));
}

// ---------- tiện ích HTTP / cookie ----------
const getSetCookies = r => (typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [r.headers.get('set-cookie')].filter(Boolean));
const cookieVal = (r, name) => { const c = getSetCookies(r).find(x => x.startsWith(name + '=')); return c ? c.split(';')[0].slice(name.length + 1) : null; };
const cookieAttrs = (r, name) => getSetCookies(r).find(x => x.startsWith(name + '=')) || '';
const get = (url, cookie, extra) => fetch(url, { redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...(extra || {}) } });
const me = async cookie => (await (await get(BASE + '/api/me', cookie)).json());

/** Đăng nhập qua luồng OAuth thật của server (máy chủ nhà cung cấp là bản giả). Trả cookie phiên. */
async function login(provider, code, next) {
  const r1 = await get(BASE + '/auth/' + provider + (next ? '?next=' + encodeURIComponent(next) : ''));
  assert.equal(r1.status, 302);
  const loc = new URL(r1.headers.get('location'));
  const state = loc.searchParams.get('state');
  if (provider === 'google') challenges.set(state, loc.searchParams.get('code_challenge'));
  const oauth = 'ct_oauth=' + cookieVal(r1, 'ct_oauth');
  const r2 = await get(`${BASE}/auth/${provider}/callback?code=${code}&state=${state}`, oauth);
  return { r1, r2, loc, state, oauth, session: cookieVal(r2, 'ct_session') ? 'ct_session=' + cookieVal(r2, 'ct_session') : null };
}

class Client {
  constructor(token, name, cookie) { this.token = token; this.name = name; this.cookie = cookie; this.msgs = []; this.waiters = []; }
  open() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`ws://localhost:${PORT}/ws`, this.cookie ? { headers: { cookie: this.cookie } } : {});
      this.ws.on('open', () => { this.send({ type: 'hello', token: this.token, name: this.name }); res(); });
      this.ws.on('error', rej);
      this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); this.waiters = this.waiters.filter(w => !w(m)); });
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(pred, ms = 4000) {
    const hit = this.msgs.find(pred); if (hit) { this.msgs.splice(this.msgs.indexOf(hit), 1); return Promise.resolve(hit); }
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(this.name + ': hết thời gian chờ')), ms);
      this.waiters.push(m => { if (pred(m)) { clearTimeout(t); this.msgs.splice(this.msgs.indexOf(m), 1); res(m); return true; } return false; });
    });
  }
  state(pred = () => true) { return this.wait(m => m.type === 'state' && pred(m.room, m.you)); }
  close() { this.ws.close(); }
}
async function playRoom(A, B, after) {
  A.send({ type: 'create', minutes: 0, increment: 0, color: 'r' });
  const { roomId } = await A.wait(m => m.type === 'created');
  B.send({ type: 'join', roomId });
  const st = await A.state(r => r.status === 'playing');
  A.send({ type: 'move', from: 64, to: 67 }); await B.state(r => r.moves.length === 1);
  B.send({ type: 'move', from: 7, to: 24 }); await A.state(r => r.moves.length === 2);
  await after();
  return { roomId, st };
}

let srv;
test.before(async () => { await startMock(); srv = await startServer(PORT, ENV); });
test.after(() => { srv && srv.kill(); mock && mock.close(); });

test('Khách: /api/me không có người dùng, báo nhà cung cấp đã bật; khách vẫn chơi như cũ', async () => {
  const j = await me();
  assert.deepEqual(j, { user: null, providers: { google: true, facebook: true } });
  const A = new Client('tok-guest-a', 'Khách A'), B = new Client('tok-guest-b', 'Khách B');
  await A.open(); await B.open();
  await playRoom(A, B, async () => { B.send({ type: 'resign' }); await A.state(r => r.status === 'over'); });
  const last = A.msgs.filter(m => m.type === 'state').pop() || await A.state();
  assert.equal(A.msgs.some(m => m.type === 'account'), false);
  A.close(); B.close();
});

test('Chuyển hướng tới Google: đủ tham số, state + PKCE, cookie tạm httpOnly/lax; chặn next ra ngoài', async () => {
  const r = await get(BASE + '/auth/google?next=' + encodeURIComponent('/r/ABC123'));
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.get('location'));
  assert.equal(loc.origin + loc.pathname, MB + '/g/auth');
  assert.equal(loc.searchParams.get('client_id'), 'gid');
  assert.equal(loc.searchParams.get('redirect_uri'), BASE + '/auth/google/callback');
  assert.equal(loc.searchParams.get('response_type'), 'code');
  assert.equal(loc.searchParams.get('scope'), 'openid profile');
  assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(loc.searchParams.get('state').length >= 20);
  const attrs = cookieAttrs(r, 'ct_oauth');
  assert.match(attrs, /HttpOnly/i); assert.match(attrs, /SameSite=Lax/i); assert.match(attrs, /Path=\/auth/i); assert.doesNotMatch(attrs, /Secure/i);
  const fb = new URL((await get(BASE + '/auth/facebook')).headers.get('location'));
  assert.equal(fb.origin + fb.pathname, MB + '/f/auth');
  assert.equal(fb.searchParams.get('redirect_uri'), BASE + '/auth/facebook/callback');
  assert.equal(fb.searchParams.get('scope'), 'public_profile');
  // next độc hại -> về "/"
  for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com']) {
    const l = await login('google', 'code-minh', bad);
    assert.equal(l.r2.headers.get('location'), '/', bad);
  }
});

test('Đăng nhập Google: phiên cookie an toàn, /api/me trả hồ sơ, quay lại đúng trang', async () => {
  const l = await login('google', 'code-huy', '/r/ABC123');
  assert.equal(l.r2.status, 302);
  assert.equal(l.r2.headers.get('location'), '/r/ABC123');
  const attrs = cookieAttrs(l.r2, 'ct_session');
  assert.match(attrs, /HttpOnly/i); assert.match(attrs, /SameSite=Lax/i); assert.match(attrs, /Max-Age=2592000/i);
  const j = await me(l.session);
  assert.equal(j.user.name, 'Huy Google'); assert.equal(j.user.provider, 'google'); assert.equal(j.user.avatar, 'https://lh3.example/huy.png');
  assert.deepEqual([j.user.wins, j.user.losses, j.user.draws], [0, 0, 0]);
  assert.equal(j.user.providerId, undefined, 'không lộ providerId');
  // đăng nhập lại -> cùng tài khoản
  const l2 = await login('google', 'code-huy');
  assert.equal((await me(l2.session)).user.id, j.user.id);
});

test('Đăng nhập Facebook (appsecret_proof) -> hồ sơ + ảnh đại diện', async () => {
  const l = await login('facebook', 'code-lan');
  assert.equal(l.r2.headers.get('location'), '/');
  const j = await me(l.session);
  assert.equal(j.user.name, 'Lan Facebook'); assert.equal(j.user.provider, 'facebook'); assert.equal(j.user.avatar, 'https://fb.example/lan.jpg');
});

test('Callback lỗi: sai state, thiếu cookie, người dùng huỷ, code sai -> không tạo phiên, báo lỗi về sảnh', async () => {
  const r1 = await get(BASE + '/auth/google');
  const oauth = 'ct_oauth=' + cookieVal(r1, 'ct_oauth'), state = new URL(r1.headers.get('location')).searchParams.get('state');
  const cases = [
    [`/auth/google/callback?code=code-huy&state=sai-${state}`, oauth],
    [`/auth/google/callback?code=code-huy&state=${state}`, null],
    [`/auth/google/callback?error=access_denied&state=${state}`, oauth],
    [`/auth/google/callback?code=code-khong-co&state=${state}`, oauth],
    [`/auth/facebook/callback?code=code-lan&state=${state}`, oauth], // state của google dùng cho facebook
  ];
  for (const [u, c] of cases) {
    const r = await get(BASE + u, c);
    assert.equal(r.status, 302, u);
    assert.match(r.headers.get('location'), /^\/\?login_error=(google|facebook)$/, u);
    assert.equal(cookieVal(r, 'ct_session'), null, u);
  }
});

test('Cookie phiên bị sửa -> coi là khách; đăng xuất xoá cookie; chặn đăng xuất từ trang khác', async () => {
  const l = await login('google', 'code-huy');
  const v = l.session.split('=')[1];
  const forged = 'ct_session=' + Buffer.from(JSON.stringify({ uid: (await me(l.session)).user.id, exp: Date.now() + 1e9 })).toString('base64url') + '.' + v.split('.')[1].replace(/^./, c => c === 'A' ? 'B' : 'A');
  assert.equal((await me(forged)).user, null);
  assert.equal((await me('ct_session=rac')).user, null);
  const evil = await fetch(BASE + '/auth/logout', { method: 'POST', headers: { cookie: l.session, origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const out = await fetch(BASE + '/auth/logout', { method: 'POST', headers: { cookie: l.session, origin: BASE } });
  assert.equal(out.status, 200);
  assert.match(cookieAttrs(out, 'ct_session'), /Expires=Thu, 01 Jan 1970/i);
});

test('Online: tên tài khoản thay tên tự nhập; kết thúc ván cập nhật thắng/thua/hoà cho người đã đăng nhập', async () => {
  const g = await login('google', 'code-huy'), f = await login('facebook', 'code-lan');
  const g0 = (await me(g.session)).user, f0 = (await me(f.session)).user;
  const A = new Client('tok-g', 'Tên giả A', g.session), B = new Client('tok-f', 'Tên giả B', f.session);
  await A.open(); await B.open();
  const { st } = await playRoom(A, B, async () => {
    B.send({ type: 'resign' });
    await A.state(r => r.status === 'over' && r.result.winner === 'r');
  });
  assert.equal(st.room.seats.r.name, 'Huy Google'); assert.equal(st.room.seats.b.name, 'Lan Facebook');
  const accA = await A.wait(m => m.type === 'account'), accB = await B.wait(m => m.type === 'account');
  assert.equal(accA.user.wins, g0.wins + 1); assert.equal(accB.user.losses, f0.losses + 1);
  assert.equal((await me(g.session)).user.wins, g0.wins + 1);
  assert.equal((await me(f.session)).user.losses, f0.losses + 1);
  // ván mới (đổi màu) -> hoà thoả thuận
  A.send({ type: 'rematch' }); B.wait(m => m.type === 'state' && m.room.pending).then(() => B.send({ type: 'respond', accept: true }));
  await A.state(r => r.status === 'playing' && r.moves.length === 0);
  // giờ A cầm Đen, B cầm Đỏ
  B.send({ type: 'move', from: 64, to: 67 }); await A.state(r => r.moves.length === 1);
  A.send({ type: 'move', from: 7, to: 24 }); await B.state(r => r.moves.length === 2);
  A.send({ type: 'draw_offer' }); await B.state(r => r.pending && r.pending.type === 'draw');
  B.send({ type: 'respond', accept: true });
  await A.state(r => r.status === 'over' && r.result.winner === null);
  await A.wait(m => m.type === 'account' && m.user.draws === g0.draws + 1);
  assert.equal((await me(f.session)).user.draws, f0.draws + 1);
  A.close(); B.close();
});

test('Khách đấu với người đăng nhập: chỉ người đăng nhập được ghi; ván < 2 nước hoặc tự đấu với chính mình không tính', async () => {
  const g = await login('google', 'code-minh'); const u0 = (await me(g.session)).user;
  const A = new Client('tok-m1', 'Minh tự nhập', g.session), B = new Client('tok-guest-z', 'Khách Z');
  await A.open(); await B.open();
  await playRoom(A, B, async () => { A.send({ type: 'resign' }); await B.state(r => r.status === 'over'); });
  await A.wait(m => m.type === 'account');
  assert.equal((await me(g.session)).user.losses, u0.losses + 1);
  // ván chỉ 0 nước -> không tính
  A.send({ type: 'create', minutes: 0, increment: 0, color: 'r' });
  const { roomId } = await A.wait(m => m.type === 'created');
  B.send({ type: 'join', roomId }); await A.state(r => r.status === 'playing');
  A.send({ type: 'resign' }); await A.state(r => r.status === 'over');
  // cùng tài khoản ở 2 ghế (2 thiết bị) -> không tính
  const C = new Client('tok-m2', 'x', g.session); await C.open();
  await playRoom(A, C, async () => { C.send({ type: 'resign' }); await A.state(r => r.status === 'over'); });
  await new Promise(r => setTimeout(r, 300));
  const u1 = (await me(g.session)).user;
  assert.deepEqual([u1.wins, u1.losses, u1.draws], [u0.wins, u0.losses + 1, u0.draws]);
  A.close(); B.close(); C.close();
});

test('Không cấu hình nhà cung cấp: nút ẩn (providers=false), /auth/* quay về sảnh, khách chơi bình thường', async () => {
  const p = await startServer(3995, { USERS_FILE: path.join(tmp, 'none.json'), GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', FACEBOOK_APP_ID: '', FACEBOOK_APP_SECRET: '', SESSION_SECRET: '' });
  try {
    const j = await (await fetch('http://localhost:3995/api/me')).json();
    assert.deepEqual(j, { user: null, providers: { google: false, facebook: false } });
    const r = await fetch('http://localhost:3995/auth/google', { redirect: 'manual' });
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/?login_error=google');
  } finally { p.kill(); }
});

test('PUBLIC_URL https -> cookie Secure, redirect_uri dùng PUBLIC_URL', async () => {
  const p = await startServer(3994, { ...ENV, PUBLIC_URL: 'https://cotuong.example/' });
  try {
    const r = await fetch('http://localhost:3994/auth/google', { redirect: 'manual' });
    assert.match(cookieAttrs(r, 'ct_oauth'), /;\s*Secure/i);
    assert.equal(new URL(r.headers.get('location')).searchParams.get('redirect_uri'), 'https://cotuong.example/auth/google/callback');
  } finally { p.kill(); }
});
