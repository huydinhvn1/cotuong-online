// Thẻ "Thông tin người chơi" (GET /api/players/:id) + tin nhắn riêng (WebSocket dm_send, hộp thư HTTP, chặn, giới hạn tốc độ)
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3984, SECRET = 'dm-secret', BASE = `http://localhost:${PORT}`;
Object.assign(process.env, { PORT: String(PORT), USERS_FILE: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-dm-')), 'users.json'), SESSION_SECRET: SECRET, PRESENCE_MS: '80' });
delete process.env.DATABASE_URL; delete process.env.DM_RATE; delete process.env.DM_WINDOW_MS;
const { server, store } = require('../server.js');
const { PUBLIC_FIELDS } = require('../lib/profile');

const cookieFor = uid => {
  const d = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 3600e3 })).toString('base64url');
  return 'ct_session=' + d + '.' + crypto.createHmac('sha256', SECRET).update(d).digest('base64url');
};
const ALL = [];
class Client {
  constructor(uid, headers) { this.token = crypto.randomUUID(); this.uid = uid; this.headers = headers || {}; this.msgs = []; ALL.push(this); }
  open() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`ws://localhost:${PORT}/ws`, { headers: { ...(this.uid ? { cookie: cookieFor(this.uid) } : {}), ...this.headers } });
      this.ws.on('open', () => this.send({ type: 'hello', token: this.token, name: 'Khách' }));
      this.ws.on('error', rej);
      this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); if (m.type === 'welcome') res(this); });
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  async wait(pred, ms = 2000) { const t = Date.now(); for (;;) { const m = this.msgs.find(pred); if (m) return m; if (Date.now() - t > ms) throw new Error('hết giờ chờ tin: ' + JSON.stringify(this.msgs.slice(-4))); await sleep(10); } }
  last(type) { const a = this.msgs.filter(m => m.type === type); return a[a.length - 1]; }
  close() { return new Promise(r => { this.ws.once('close', r); this.ws.close(); }); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = (p, uid, init = {}) => fetch(BASE + p, { ...init, headers: { ...(uid ? { cookie: cookieFor(uid) } : {}), ...(init.headers || {}) } }).then(async r => ({ status: r.status, cc: r.headers.get('cache-control'), body: await r.json().catch(() => null) }));
let n = 0;
const newUser = (name, provider = 'google') => store.upsertOAuthUser({ provider, providerId: 'secret-provider-id-' + (++n), name, avatar: 'https://x.test/' + n + '.png' });

test.before(() => new Promise(r => server.listening ? r() : server.once('listening', r)));
test.after(() => { for (const c of ALL) c.ws && c.ws.terminate(); if (server.closeAllConnections) server.closeAllConnections(); server.close(); });

test('GET /api/players/:id: chỉ trường công khai (không providerId), Elo theo kiểu cờ, số ván, ngày tham gia', async () => {
  const u = await newUser('Huy'), v = await newUser('Lan', 'facebook');
  await store.recordResult(u.id, 'win'); await store.recordResult(u.id, 'draw');
  await store.recordRatedGame({ r: u.id, b: v.id, variant: 'jieqi', winner: 'r' });
  const r = await api('/api/players/' + u.id);
  assert.equal(r.status, 200); assert.equal(r.cc, 'no-store');
  const p = r.body.player;
  assert.deepEqual(Object.keys(p).sort(), [...PUBLIC_FIELDS].sort());
  assert.deepEqual([p.id, p.name, p.provider, p.guest, p.wins, p.losses, p.draws, p.games, p.ratedGames], [u.id, 'Huy', 'google', false, 1, 0, 1, 2, 1]);
  assert.deepEqual(p.ratings, { standard: { rating: 1200, games: 0 }, jieqi: { rating: 1220, games: 1 } });
  assert.equal(p.joinedAt, u.createdAt);
  const raw = JSON.stringify(r.body);
  assert.doesNotMatch(raw, /secret-provider-id|providerId|provider_id|email|token/i);
  assert.equal((await api('/api/players/' + v.id)).body.player.provider, 'facebook');
  assert.equal((await api('/api/players/00000000-0000-4000-8000-000000000000')).status, 404);
  assert.equal((await api('/api/players/..%2F..%2Fetc')).status, 404);
  assert.equal((await api('/api/players/abc')).status, 404);
});

test('Tin nhắn: gửi trực tiếp khi online, chưa đọc khi offline, hộp thư, đọc, chặn, giới hạn, khách không dùng được', async () => {
  const a = await newUser('An'), b = await newUser('Bình'), c = await newUser('Chi');
  const A = await new Client(a.id).open(), A2 = await new Client(a.id).open(), B = await new Client(b.id).open(), G = await new Client().open();
  assert.equal((await A.wait(m => m.type === 'dm_unread')).count, 0, 'đăng nhập -> nhận số tin chưa đọc');
  // khách không gửi được
  G.send({ type: 'dm_send', to: a.id, body: 'hi', cid: 'g1' });
  assert.equal((await G.wait(m => m.type === 'dm_error')).code, 'login');
  // gửi khi người nhận đang online: tới ngay, mọi thẻ của người gửi cũng thấy
  A.send({ type: 'dm_send', to: b.id, body: '<img src=x onerror=alert(1)> chào', cid: 'c1' });
  const got = await B.wait(m => m.type === 'dm');
  assert.equal(got.msg.body, '<img src=x onerror=alert(1)> chào', 'server lưu nguyên văn, client escape khi hiển thị');
  assert.deepEqual(got.peer, { id: a.id, name: 'An', avatar: a.avatar });
  assert.equal(got.cid, undefined);
  assert.equal((await A.wait(m => m.type === 'dm')).cid, 'c1');
  const echo2 = await A2.wait(m => m.type === 'dm');
  assert.equal(echo2.cid, undefined); assert.equal(echo2.peer.id, b.id);
  assert.equal((await B.wait(m => m.type === 'dm_unread' && m.count === 1)).count, 1);
  // lỗi đầu vào
  for (const [body, to, code] of [['x'.repeat(501), b.id, 'too_long'], ['   ', b.id, 'empty'], ['hi', a.id, 'no_user'], ['hi', '00000000-0000-4000-8000-000000000000', 'no_user'], ['hi', 'abc', 'no_user']]) {
    const cid = 'e' + Math.random(); A.send({ type: 'dm_send', to, body, cid });
    assert.equal((await A.wait(m => m.type === 'dm_error' && m.cid === cid)).code, code, code);
  }
  A.send({ type: 'dm_send', to: b.id, body: 'y'.repeat(500), cid: 'max' });
  assert.equal((await A.wait(m => m.type === 'dm' && m.cid === 'max')).msg.body.length, 500, 'đúng 500 ký tự vẫn gửi được');
  // gửi khi người nhận offline -> lần đăng nhập sau thấy chưa đọc
  A.send({ type: 'dm_send', to: c.id, body: 'Chi ơi', cid: 'off' }); await A.wait(m => m.cid === 'off' && m.type === 'dm');
  const C = await new Client(c.id).open();
  assert.equal((await C.wait(m => m.type === 'dm_unread')).count, 1);
  // hộp thư HTTP
  assert.equal((await api('/api/messages')).status, 401, 'khách: 401');
  const inbox = await api('/api/messages', b.id);
  assert.equal(inbox.status, 200); assert.equal(inbox.cc, 'no-store');
  assert.equal(inbox.body.unread, 2);
  assert.deepEqual(inbox.body.conversations.map(x => [x.peer.id, x.peer.name, x.unread, x.blocked]), [[a.id, 'An', 2, false]]);
  assert.doesNotMatch(JSON.stringify(inbox.body), /secret-provider-id|providerId/);
  const ia = await api('/api/messages', a.id);
  assert.deepEqual(ia.body.conversations.map(x => x.peer.id), [c.id, b.id], 'mới nhất trước');
  // mở luồng -> đánh dấu đã đọc + đẩy số chưa đọc mới
  const th = await api('/api/messages/' + a.id, b.id);
  assert.equal(th.status, 200);
  assert.deepEqual(th.body.messages.map(m => m.from), [a.id, a.id]);
  assert.equal(th.body.peer.name, 'An'); assert.equal(th.body.blocked, false); assert.equal(th.body.max, 500);
  assert.equal((await B.wait(m => m.type === 'dm_unread' && m.count === 0)).count, 0);
  assert.equal((await api('/api/messages/' + b.id, b.id)).status, 404, 'không mở luồng với chính mình');
  assert.equal((await api('/api/messages/' + a.id, c.id)).body.messages.length, 1, 'chỉ thấy tin của mình');
  // dm_read qua WebSocket
  C.send({ type: 'dm_read', peer: a.id });
  assert.equal((await C.wait(m => m.type === 'dm_unread' && m.count === 0)).count, 0);
  // chặn: cần header chống CSRF
  assert.equal((await api('/api/blocks/' + a.id, b.id, { method: 'POST' })).status, 403);
  assert.equal((await api('/api/blocks/' + a.id, null, { method: 'POST', headers: { 'x-ct-csrf': '1' } })).status, 401);
  const bl = await api('/api/blocks/' + a.id, b.id, { method: 'POST', headers: { 'x-ct-csrf': '1' } });
  assert.deepEqual(bl.body, { ok: true, blocked: true });
  A.send({ type: 'dm_send', to: b.id, body: 'còn đó không?', cid: 'bl' });
  assert.equal((await A.wait(m => m.type === 'dm_error' && m.cid === 'bl')).code, 'blocked');
  B.send({ type: 'dm_send', to: a.id, body: 'hi', cid: 'yb' });
  assert.equal((await B.wait(m => m.type === 'dm_error' && m.cid === 'yb')).code, 'you_blocked');
  assert.equal((await api('/api/messages', b.id)).body.conversations[0].blocked, true);
  assert.equal((await api('/api/messages/' + a.id, b.id)).body.blocked, true);
  await sleep(100); assert.ok(!B.msgs.some(m => m.type === 'dm' && m.msg.body === 'còn đó không?'), 'tin bị chặn không tới');
  const ub = await api('/api/blocks/' + a.id, b.id, { method: 'DELETE', headers: { 'x-ct-csrf': '1' } });
  assert.deepEqual(ub.body, { ok: true, blocked: false });
  // giới hạn tốc độ: 10 tin / 30 giây (đã gửi 3 tin thành công ở trên; tin bị chặn không tính)
  const codes = [];
  for (let i = 0; i < 8; i++) { const cid = 'r' + i; A.send({ type: 'dm_send', to: b.id, body: 'spam ' + i, cid }); const r = await A.wait(m => m.cid === cid); codes.push(r.type === 'dm' ? 'ok' : r.code); }
  assert.deepEqual(codes, ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'rate']);
  // trang khác nguồn không gửi được qua WebSocket dù có cookie
  const X = await new Client(a.id, { origin: 'https://evil.example' }).open();
  X.send({ type: 'dm_send', to: b.id, body: 'hi', cid: 'x' });
  assert.equal((await X.wait(m => m.type === 'dm_error')).code, 'origin');
  const Y = await new Client(b.id, { origin: `http://localhost:${PORT}` }).open();
  Y.send({ type: 'dm_send', to: c.id, body: 'cùng nguồn', cid: 'y' });
  assert.equal((await Y.wait(m => m.cid === 'y')).type, 'dm');
  for (const k of [A, A2, B, G, C, X, Y]) await k.close();
});

test('Ghế đã đăng nhập có id công khai (mở thẻ người chơi), khách thì không', async () => {
  const u = await newUser('Ghế');
  const U = await new Client(u.id).open(), G = await new Client().open();
  U.send({ type: 'create', color: 'r' }); const cr = await U.wait(m => m.type === 'created');
  G.send({ type: 'join', roomId: cr.roomId });
  const st = await G.wait(m => m.type === 'state' && m.room.seats.b);
  assert.equal(st.room.seats.r.id, u.id);
  assert.equal(st.room.seats.b.id, undefined);
  await U.close(); await G.close();
});
