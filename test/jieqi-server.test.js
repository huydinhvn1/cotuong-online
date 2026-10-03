// Cờ úp online: server giữ mặt thật quân úp, chỉ gửi mặt quân khi đã lật / bị ăn (không gian lận bằng devtools)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const X = require('../shared/xiangqi');
const { sq } = X;

const PORT = 3988;
process.env.PORT = String(PORT);
process.env.USERS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-jq-')), 'users.json');
delete process.env.DATABASE_URL;
const { server, rooms } = require('../server.js'); // chạy trong cùng tiến trình để đối chiếu với mặt thật trên server

const ALL = []; // đóng hết khi kết thúc để tiến trình không treo nếu một bài thử lỗi
class Client {
  constructor(token, name) { this.token = token; this.name = name; this.raw = []; this.msgs = []; this.waiters = []; }
  open() {
    return new Promise((res, rej) => {
      ALL.push(this);
      this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
      this.ws.on('open', () => { this.send({ type: 'hello', token: this.token, name: this.name }); res(); });
      this.ws.on('error', rej);
      this.ws.on('message', d => { this.raw.push(String(d)); const m = JSON.parse(d); this.msgs.push(m); this.waiters = this.waiters.filter(w => !w(m)); });
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(pred, ms = 3000) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(this.name + ': hết thời gian chờ')), ms);
      this.waiters.push(m => { if (pred(m)) { clearTimeout(t); res(m); return true; } return false; });
    });
  }
  state(pred = () => true) { return this.wait(m => m.type === 'state' && pred(m.room, m.you)); }
  close() { this.ws.close(); }
}

test.before(() => new Promise(r => server.listening ? r() : server.once('listening', r)));
test.after(() => { for (const c of ALL) if (c.ws) c.ws.terminate(); if (server.closeAllConnections) server.closeAllConnections(); server.close(); });

const ROOM_KEYS = ['id', 'variant', 'rated', 'gameNo', 'status', 'result', 'pending', 'seats', 'spectators', 'fen', 'turn', 'check', 'moves', 'timeControl', 'clocks', 'running'].sort();
const MOVE_KEYS = new Set(['from', 'to', 'n', 'side', 'cap', 'check', 'rv']);

test('Phòng cờ úp: chỉ gửi thông tin công khai, mặt quân lộ đúng lúc lật / bị ăn', async () => {
  const A = new Client('jq-A', 'Huy'), B = new Client('jq-B', 'Lan'), C = new Client('jq-C', 'Xem');
  await A.open(); await B.open(); await C.open();
  A.send({ type: 'create', variant: 'jieqi', color: 'r' });
  const created = await A.wait(m => m.type === 'created');
  const id = created.roomId, room = rooms.get(id);
  assert.equal(room.variant, 'jieqi');
  const deal = room.game.deal();
  assert.ok(X.validDeal(deal));
  B.send({ type: 'join', roomId: id }); await B.state(r => r.status === 'playing');
  C.send({ type: 'join', roomId: id }); await C.state(r => r.spectators === 1);

  // chọn nước theo ván công khai; có cả nước ăn quân úp
  const pub = X.createGame('jieqi');
  const plan = [[sq(7, 1), sq(0, 1)], [sq(0, 0), sq(0, 1)], [sq(6, 4), sq(5, 4)], [sq(3, 4), sq(4, 4)]];
  for (let i = 0; i < 16; i++) {
    let mv = plan[i];
    if (pub.status().over) break;
    // nước định sẵn có thể không hợp lệ với một số cách xáo (vd. quân vừa lật là Pháo ghim tướng) -> chọn nước khác
    if (!mv || pub.moveError(mv[0], mv[1])) { const ms = pub.moves(); const m = ms[(i * 7) % ms.length]; mv = [m.from, m.to]; }
    const who = pub.turn === 'r' ? A : B, n = pub.history.length + 1;
    who.send({ type: 'move', from: mv[0], to: mv[1] });
    const st = await C.state(r => r.moves.length === n);
    const last = st.room.moves[n - 1], truth = room.game.history[n - 1];
    assert.equal(last.rv, truth.reveal, 'rv = mặt thật của quân vừa lật');
    if (truth.capReal) assert.equal(last.cap, truth.capReal, 'quân úp bị ăn lộ mặt');
    assert.ok(pub.move(last.from, last.to, { reveal: last.rv, cap: last.cap }));
    assert.equal(st.room.fen, pub.fen(), 'client dựng lại đúng thế cờ chỉ từ thông tin công khai');
  }
  assert.ok(room.game.history.some(h => h.capReal), 'đã có nước ăn quân úp');

  // Kiểm tra mọi tin nhắn tới cả 3 client: không có khoá lạ, không lộ mặt quân còn úp
  const hiddenNow = X.JIEQI_SQUARES.filter(s => X.isHidden(room.game.board[s]));
  assert.ok(hiddenNow.length >= 15);
  for (const c of [A, B, C]) {
    for (const raw of c.raw) {
      assert.ok(!raw.includes(deal) && !raw.includes(deal.slice(0, 15)) && !raw.includes(deal.slice(15)), 'không lộ chuỗi xáo bài');
      assert.ok(!/secret|deal/i.test(raw), 'không có trường bí mật');
      const m = JSON.parse(raw);
      if (m.type !== 'state') continue;
      assert.deepEqual(Object.keys(m.room).sort(), ROOM_KEYS);
      // FEN: mọi ô còn úp là X/x
      const b = X.parseFen(m.room.fen).board;
      for (const s of hiddenNow) assert.ok(X.isHidden(b[s]));
      // nước đi: chỉ khoá công khai; rv chỉ có ở nước lật quân
      m.room.moves.forEach((mv, k) => {
        for (const key of Object.keys(mv)) assert.ok(MOVE_KEYS.has(key), 'khoá ' + key);
        assert.equal(mv.rv, room.game.history[k].reveal);
      });
    }
  }
  // tập mặt quân đã lộ = đúng các quân đã lật/bị ăn (không hơn)
  const exposed = room.game.history.filter(h => h.reveal).length + room.game.history.filter(h => h.capReal).length;
  const told = C.msgs.filter(m => m.type === 'state').at(-1).room.moves.reduce((n, mv, k) => n + (mv.rv ? 1 : 0) + (room.game.history[k].capReal ? 1 : 0), 0);
  assert.equal(told, exposed);

  // xin đi lại: quân về úp lại
  const before = room.game.history.length;
  const lastMover = room.game.history.at(-1).side === 'r' ? A : B, other = lastMover === A ? B : A;
  lastMover.send({ type: 'undo_request' }); await other.state(r => r.pending && r.pending.type === 'undo');
  other.send({ type: 'respond', accept: true });
  const after = await C.state(r => r.moves.length === before - 1);
  const undone = room.game.history.length;
  assert.equal(undone, before - 1);
  assert.equal(after.room.fen, room.game.fen());

  // ván mới vẫn là cờ úp, xáo lại
  A.send({ type: 'resign' }); await A.state(r => r.status === 'over');
  A.send({ type: 'rematch' }); await B.state(r => r.pending && r.pending.type === 'rematch');
  B.send({ type: 'respond', accept: true });
  const ng = await A.state(r => r.gameNo === 2);
  assert.equal(ng.room.variant, 'jieqi');
  assert.equal(ng.room.fen, X.JIEQI_FEN);
  assert.ok(X.validDeal(room.game.deal()));
  [A, B, C].forEach(c => c.close());
});

test('Phòng thường vẫn là cờ tướng; kiểu cờ lạ -> cờ tướng', async () => {
  const A = new Client('std-A', 'An');
  await A.open();
  A.send({ type: 'create', color: 'r' });
  const s1 = await A.state();
  assert.equal(s1.room.variant, 'standard');
  assert.equal(s1.room.fen, X.INITIAL_FEN);
  A.send({ type: 'create', variant: 'hack', color: 'r' });
  const s2 = await A.state(r => r.id !== s1.room.id);
  assert.equal(s2.room.variant, 'standard');
  A.close();
});
