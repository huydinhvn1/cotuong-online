// Ghép trận tự động + Elo trên server thật (trong cùng tiến trình): hàng đợi, không tự ghép, rời hàng đợi khi mất kết nối,
// ván ghép trận tính Elo (thắng/thua/hoà/xin thua/mất kết nối), phòng tự tạo không tính Elo.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const X = require('../shared/xiangqi');

const PORT = 3987, SECRET = 'mm-test-secret';
const FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-mm-')), 'users.json');
Object.assign(process.env, { PORT: String(PORT), USERS_FILE: FILE, SESSION_SECRET: SECRET, ABANDON_MS: '1500' });
delete process.env.DATABASE_URL;
const { server, mm, store } = require('../server.js');

const cookieFor = uid => {
  const d = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 3600e3 })).toString('base64url');
  return 'ct_session=' + d + '.' + crypto.createHmac('sha256', SECRET).update(d).digest('base64url');
};
class Client {
  constructor(name, uid, token) { this.name = name; this.uid = uid; this.token = token || crypto.randomUUID(); this.msgs = []; this.waiters = []; }
  open() {
    return new Promise((res, rej) => {
      ALL.push(this);
      this.ws = new WebSocket(`ws://localhost:${PORT}/ws`, this.uid ? { headers: { cookie: cookieFor(this.uid) } } : {});
      this.ws.on('open', () => { this.send({ type: 'hello', token: this.token, name: this.name }); res(this); });
      this.ws.on('error', rej);
      this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); this.waiters = this.waiters.filter(w => !w(m)); });
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(pred, ms = 4000) {
    const hit = this.msgs.find(pred); if (hit) { this.msgs.splice(this.msgs.indexOf(hit), 1); return Promise.resolve(hit); }
    return new Promise((res, rej) => {
      const t = setTimeout(() => { if (process.env.MM_DEBUG) console.log('DBGW', this.name, String(pred), JSON.stringify(this.msgs.slice(-4))); rej(new Error(this.name + ': hết thời gian chờ')); }, ms);
      this.waiters.push(m => { if (pred(m)) { clearTimeout(t); this.msgs.splice(this.msgs.indexOf(m), 1); res(m); return true; } return false; });
    });
  }
  type(t, ms) { return this.wait(m => m.type === t, ms); }
  state(pred = () => true, ms) { return this.wait(m => m.type === 'state' && pred(m.room, m.you), ms).then(m => m.room); }
  clear() { this.msgs = []; }
  close() { return new Promise(r => { this.ws.once('close', r); this.ws.close(); }); }
}
const ALL = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('until: hết thời gian'); await sleep(20); } }
let n = 0;
async function user(name, ratings) {
  const u = await store.upsertOAuthUser({ provider: 'google', providerId: 'mm-' + (++n), name });
  if (ratings) { store.users.get(u.id).ratings = ratings; }
  return u;
}
async function login(name, ratings) { const u = await user(name, ratings); const c = await new Client(name, u.id).open(); await c.type('welcome'); return c; }
/** đi 2 nước hợp lệ (Đỏ rồi Đen) */
async function twoMoves(red, black) {
  const g = new X.Game(); const m1 = g.moves()[0]; g.move(m1.from, m1.to); const m2 = g.moves()[0];
  red.send({ type: 'move', from: m1.from, to: m1.to }); await black.state(r => r.moves.length === 1);
  black.send({ type: 'move', from: m2.from, to: m2.to }); await red.state(r => r.moves.length === 2);
}
async function matchPair(a, b, variant = 'standard') {
  a.send({ type: 'mm_join', variant }); await a.wait(m => m.type === 'mm_status' && m.state === 'searching');
  b.send({ type: 'mm_join', variant });
  const fa = await a.type('mm_found'), fb = await b.type('mm_found');
  const sa = await a.state(r => r.id === fa.roomId && r.status === 'playing');
  await b.state(r => r.id === fb.roomId && r.status === 'playing');
  const red = fa.color === 'r' ? a : b, black = red === a ? b : a;
  return { fa, fb, room: sa, red, black };
}
const readFile = () => JSON.parse(fs.readFileSync(FILE, 'utf8')).users;

test.before(() => new Promise(r => server.listening ? r() : server.once('listening', r)));
test.after(() => { for (const c of ALL) c.ws.terminate(); if (server.closeAllConnections) server.closeAllConnections(); server.close(); });

test('Khách không tìm được đối thủ tự động; kiểu cờ lạ -> cờ tướng', async () => {
  const g = await new Client('Khách').open(); await g.type('welcome');
  g.send({ type: 'mm_join', variant: 'standard' });
  const e = await g.type('error'); assert.equal(e.code, 'mm_login'); assert.match(e.text, /Đăng nhập để tìm đối thủ tự động/);
  assert.equal(mm.size, 0);
  const a = await login('Lạ');
  a.send({ type: 'mm_join', variant: 'chess' });
  const st = await a.wait(m => m.type === 'mm_status' && m.state === 'searching');
  assert.deepEqual([st.variant, st.rating, st.gap], ['standard', 1200, 100]);
  a.send({ type: 'mm_leave' }); await a.wait(m => m.type === 'mm_status' && m.state === 'idle');
  assert.equal(mm.size, 0);
  await g.close(); await a.close();
});

test('Ghép trận: phòng mới, màu ngẫu nhiên, thấy tên + Elo đối thủ, ván xếp hạng', async () => {
  const colors = new Set();
  for (let i = 0; i < 16; i++) {
    const a = await login('An' + i), b = await login('Bình' + i);
    const { fa, fb, room } = await matchPair(a, b);
    assert.equal(fa.roomId, fb.roomId); assert.notEqual(fa.color, fb.color); colors.add(fa.color);
    assert.deepEqual(fa.opponent, { name: 'Bình' + i, rating: 1200 }); assert.deepEqual(fb.opponent, { name: 'An' + i, rating: 1200 });
    assert.equal(room.rated, true); assert.equal(room.variant, 'standard');
    assert.deepEqual(room.timeControl, { base: 600000, inc: 5000 });
    assert.equal(room.seats.r.rating, 1200); assert.equal(room.seats.b.rating, 1200);
    assert.deepEqual([room.seats[fa.color].name, room.seats[fb.color].name], ['An' + i, 'Bình' + i]);
    assert.equal(mm.size, 0);
    await a.close(); await b.close();
  }
  assert.equal(colors.size, 2, 'màu quân được chọn ngẫu nhiên');
});

test('Ưu tiên Elo gần nhất; cùng tài khoản ở 2 thẻ không tự ghép; mất kết nối thì rời hàng đợi', async () => {
  const hi = await login('Cao', { standard: { rating: 1500, games: 30 } });
  const mid = await login('Giữa', { standard: { rating: 1210, games: 30 } });
  mid.send({ type: 'mm_join', variant: 'standard' }); await mid.wait(m => m.state === 'searching');
  hi.send({ type: 'mm_join', variant: 'standard' }); await hi.wait(m => m.state === 'searching');
  await sleep(1200); assert.equal(mm.size, 2, 'chênh 290 > ±100: chưa ghép');
  const near = await login('Gần', { standard: { rating: 1190, games: 30 } });
  near.send({ type: 'mm_join', variant: 'standard' });
  const f = await near.type('mm_found'); assert.deepEqual(f.opponent, { name: 'Giữa', rating: 1210 });
  assert.equal(mm.size, 1, '"Cao" vẫn chờ');
  // khác kiểu cờ không ghép với nhau
  const jq = await login('Úp'); jq.send({ type: 'mm_join', variant: 'jieqi' }); await jq.wait(m => m.state === 'searching');
  await sleep(1100); assert.equal(mm.size, 2);
  // mất kết nối khi đang chờ -> rời hàng đợi
  await hi.close(); await jq.close();
  await until(() => mm.size === 0);
  // cùng tài khoản, 2 thẻ (cùng token như trình duyệt thật)
  const u = await user('Hai Thẻ');
  const tok = crypto.randomUUID();
  const t1 = await new Client('Hai Thẻ', u.id, tok).open(), t2 = await new Client('Hai Thẻ', u.id, tok).open();
  await t1.type('welcome'); await t2.type('welcome');
  t1.send({ type: 'mm_join', variant: 'standard' }); await t1.wait(m => m.state === 'searching');
  t2.send({ type: 'mm_join', variant: 'standard' }); await t2.wait(m => m.state === 'searching');
  const cancelled = await t1.wait(m => m.type === 'mm_status' && m.state === 'idle');
  assert.equal(cancelled.reason, 'other_tab');
  await sleep(1100);
  assert.equal(mm.size, 1); assert.ok(!t1.msgs.concat(t2.msgs).some(m => m.type === 'mm_found'), 'không tự ghép với chính mình');
  // người khác vào -> ghép với thẻ đang tìm
  const o = await login('Khác'); o.send({ type: 'mm_join', variant: 'standard' });
  const fo = await o.type('mm_found'); assert.equal(fo.opponent.name, 'Hai Thẻ'); await t2.type('mm_found');
  for (const c of [mid, near, t1, t2, o]) await c.close();
});

test('Ván ghép trận tính Elo (xin thua, hoà) và lưu vào kho; phòng tự tạo không tính Elo', async () => {
  const a = await login('Phong'), b = await login('Quân');
  const { red, black } = await matchPair(a, b);
  await twoMoves(red, black);
  black.send({ type: 'resign' }); // Đỏ thắng
  const rr = await red.type('rating'), rb = await black.type('rating');
  assert.deepEqual([rr.variant, rr.before, rr.after, rr.delta, rr.games], ['standard', 1200, 1220, 20, 1]);
  assert.deepEqual([rb.before, rb.after, rb.delta], [1200, 1180, -20]);
  const acc = await red.wait(m => m.type === 'account' && m.user.wins === 1);
  assert.deepEqual(acc.user.ratings.standard, { rating: 1220, games: 1 }); assert.deepEqual(acc.user.ratings.jieqi, { rating: 1200, games: 0 });
  await red.state(r => r.seats.r.rating === 1220 && r.seats.b.rating === 1180);
  const fileUser = c => readFile().find(u => u.name === c.name);
  await until(() => fileUser(red).ratings?.standard?.rating === 1220 && fileUser(red).wins === 1 && fileUser(black).losses === 1);
  assert.equal(fileUser(black).ratings.standard.rating, 1180); assert.equal(fileUser(black).losses, 1);
  // ván mới trong phòng ghép trận (đổi màu) vẫn tính Elo: hoà
  red.clear(); black.clear();
  red.send({ type: 'rematch' }); await black.wait(m => m.type === 'state' && m.room.pending && m.room.pending.type === 'rematch');
  black.send({ type: 'respond', accept: true });
  const s2 = await red.state(r => r.gameNo === 2 && r.status === 'playing');
  assert.equal(s2.seats.b.name, red.name, 'đổi màu quân');
  await twoMoves(black, red);
  red.send({ type: 'draw_offer' }); await black.wait(m => m.type === 'state' && m.room.pending && m.room.pending.type === 'draw');
  black.send({ type: 'respond', accept: true });
  const d1 = await red.type('rating'), d2 = await black.type('rating');
  assert.deepEqual([d1.before, d1.after, d2.before, d2.after], [1220, 1218, 1180, 1182]);
  // phòng tự tạo: không tính Elo, vẫn tính thắng/thua
  red.clear(); black.clear();
  red.send({ type: 'leave' }); black.send({ type: 'leave' });
  red.send({ type: 'create', color: 'r', variant: 'standard' }); const cr = await red.type('created');
  black.send({ type: 'join', roomId: cr.roomId }); const ps = await black.state(r => r.id === cr.roomId && r.status === 'playing');
  assert.equal(ps.rated, false); assert.equal(ps.seats.r.rating, undefined);
  await twoMoves(red, black); black.send({ type: 'resign' });
  const acc2 = await red.wait(m => m.type === 'account' && m.user.wins === 2);
  assert.equal(acc2.user.ratings.standard.rating, 1218, 'phòng tự tạo không đổi Elo');
  await sleep(200); assert.ok(!red.msgs.concat(black.msgs).some(m => m.type === 'rating'));
  await a.close(); await b.close();
});

test('Ván xếp hạng: mất kết nối quá lâu bị xử thua; chưa đủ 2 nước thì huỷ ván, không tính Elo', async () => {
  const a = await login('Ở lại'), b = await login('Bỏ đi');
  const { red, black, room: st } = await matchPair(a, b, 'jieqi');
  assert.equal(st.variant, 'jieqi');
  // cờ úp: Đỏ đi 1 nước hợp lệ theo FEN công khai
  const g = X.createGame('jieqi'); const m1 = g.moves()[0];
  red.send({ type: 'move', from: m1.from, to: m1.to }); const s1 = await black.state(r => r.moves.length === 1);
  const g2 = new X.Game(s1.fen); const m2 = g2.moves()[0];
  black.send({ type: 'move', from: m2.from, to: m2.to }); await red.state(r => r.moves.length === 2);
  assert.ok(st.rated);
  const stay = b === red ? b : a; // giữ người đó lại, người kia rời đi
  const gone = stay === a ? b : a;
  stay.clear();
  await gone.close();
  await stay.wait(m => m.type === 'toast' && /mất kết nối/.test(m.text));
  const over = await stay.state(r => r.status === 'over', 4000);
  assert.equal(over.result.reason, 'abandon'); assert.equal(over.result.winner, stay === red ? 'r' : 'b');
  const r = await stay.type('rating'); assert.deepEqual([r.variant, r.delta], ['jieqi', 20]);
  await until(() => readFile().find(u => u.name === gone.name).ratings?.jieqi?.rating === 1180);
  assert.equal(readFile().find(u => u.name === gone.name).ratings.standard.rating, 1200, 'Elo cờ tướng không đổi');
  await stay.close();
  // chưa đi nước nào mà rời -> huỷ
  const c = await login('C'), d = await login('D');
  await matchPair(c, d); c.clear();
  await d.close();
  const ab = await c.state(r => r.status === 'over', 4000);
  assert.deepEqual(ab.result, { winner: null, reason: 'aborted' });
  await sleep(300); assert.ok(!c.msgs.some(m => m.type === 'rating'));
  const cu = readFile().find(u => u.name === 'C'); assert.equal(cu.wins + cu.losses + cu.draws, 0);
  await c.close();
});
