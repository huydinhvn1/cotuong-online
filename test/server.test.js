// Kiểm thử đầu-cuối: khởi động server, 2 người chơi + 1 khán giả qua WebSocket
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');
const X = require('../shared/xiangqi');
const sq = X.sq;
const PORT = 3999;

class Client {
  constructor(token, name) { this.token = token; this.name = name; this.msgs = []; this.waiters = []; }
  open() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
      this.ws.on('open', () => { this.send({ type: 'hello', token: this.token, name: this.name }); res(); });
      this.ws.on('error', rej);
      this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); this.waiters = this.waiters.filter(w => !w(m)); });
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

let srv;
test.before(async () => {
  srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT } });
  await new Promise(r => srv.stdout.on('data', d => /đang chạy/.test(d) && r()));
});
test.after(() => srv.kill());

test('Hai người chơi + khán giả: tạo phòng, đi cờ, đi lại, chat, kết nối lại, hoà, ván mới, xin thua', async () => {
  const A = new Client('tok-A', 'Huy'), B = new Client('tok-B', 'Lan'), C = new Client('tok-C', 'Khán giả');
  await A.open(); await B.open(); await C.open();

  A.send({ type: 'create', minutes: 10, increment: 0, color: 'r' });
  const { roomId } = await A.wait(m => m.type === 'created');
  assert.match(roomId, /^[A-Z0-9]{6}$/);

  B.send({ type: 'join', roomId });
  const sb = await B.state(r => r.status === 'playing');
  assert.equal(sb.you.color, 'b');
  C.send({ type: 'join', roomId });
  const sc = await C.state(r => r.spectators === 1);
  assert.equal(sc.you.color, null);
  assert.equal(sc.room.seats.r.name, 'Huy');

  // Đen đi trước lượt -> lỗi
  B.send({ type: 'move', from: sq(0, 7), to: sq(2, 6) });
  await B.wait(m => m.type === 'error' && /lượt/.test(m.text));

  // Đỏ: Pháo 2 bình 5
  A.send({ type: 'move', from: sq(7, 7), to: sq(7, 4) });
  const s1 = await C.state(r => r.moves.length === 1);
  assert.equal(s1.room.moves[0].n, 'P2-5');
  assert.equal(s1.room.turn, 'b');

  // Nước sai bị từ chối
  B.send({ type: 'move', from: sq(0, 0), to: sq(5, 0) });
  await B.wait(m => m.type === 'error' && /không hợp lệ/.test(m.text));

  // Đen: Mã 8 tiến 7
  B.send({ type: 'move', from: sq(0, 7), to: sq(2, 6) });
  const s2 = await A.state(r => r.moves.length === 2);
  assert.equal(s2.room.moves[1].n, 'M8.7');
  assert.equal(s2.room.running, 'r');
  assert.ok(s2.room.clocks.b <= 600000 && s2.room.clocks.b > 590000);

  // Đen xin đi lại -> Đỏ đồng ý
  B.send({ type: 'undo_request' });
  await A.state(r => r.pending && r.pending.type === 'undo' && r.pending.by === 'b');
  A.send({ type: 'respond', accept: true });
  const s3 = await C.state(r => r.moves.length === 1 && !r.pending);
  assert.equal(s3.room.turn, 'b');

  // Chat
  C.send({ type: 'chat', text: 'Chào hai kỳ thủ!' });
  const chat = await A.wait(m => m.type === 'chat');
  assert.equal(chat.message.text, 'Chào hai kỳ thủ!');
  assert.equal(chat.message.color, null);

  // Kết nối lại (F5): A đóng và mở lại cùng token
  A.close();
  await B.state(r => r.seats.r && r.seats.r.online === false);
  const A2 = new Client('tok-A', 'Huy'); await A2.open();
  A2.send({ type: 'join', roomId });
  const s4 = await A2.state();
  assert.equal(s4.you.color, 'r');
  assert.equal(s4.room.moves.length, 1);
  await A2.wait(m => m.type === 'chat_history' || true).catch(() => { });

  // Tiếp tục đánh sau khi kết nối lại
  B.send({ type: 'move', from: sq(0, 1), to: sq(2, 2) });
  await A2.state(r => r.moves.length === 2);

  // Cầu hoà -> đồng ý
  A2.send({ type: 'draw_offer' });
  await B.state(r => r.pending && r.pending.type === 'draw');
  B.send({ type: 'respond', accept: true });
  const s5 = await C.state(r => r.status === 'over');
  assert.deepEqual(s5.room.result, { winner: null, reason: 'agreement' });

  // Ván mới -> đổi màu
  A2.send({ type: 'rematch' });
  await B.state(r => r.pending && r.pending.type === 'rematch');
  B.send({ type: 'respond', accept: true });
  const s6 = await A2.state(r => r.gameNo === 2);
  assert.equal(s6.you.color, 'b');
  assert.equal(s6.room.status, 'playing');
  assert.equal(s6.room.moves.length, 0);

  // B giờ cầm Đỏ, xin thua
  B.send({ type: 'resign' });
  const s7 = await C.state(r => r.status === 'over' && r.gameNo === 2);
  assert.deepEqual(s7.room.result, { winner: 'b', reason: 'resign' });

  A2.close(); B.close(); C.close();
});

test('Chiếu bí kết thúc ván trên server', async () => {
  const A = new Client('m-A', 'A'), B = new Client('m-B', 'B');
  await A.open(); await B.open();
  A.send({ type: 'create', minutes: 0, color: 'r' });
  const { roomId } = await A.wait(m => m.type === 'created');
  B.send({ type: 'join', roomId });
  await A.state(r => r.status === 'playing');
  // Ván ngắn 9 nước, Đỏ chiếu bí (chuỗi được sinh và kiểm chứng bằng bộ luật)
  const seq = [[88, 69], [19, 55], [64, 67], [1, 18], [67, 31], [7, 26], [70, 52], [27, 36], [52, 49]];
  const g = new X.Game();
  for (let i = 0; i < seq.length; i++) {
    const [f, t] = seq[i]; assert.ok(g.move(f, t), 'nước ' + i + ' hợp lệ');
    (i % 2 ? B : A).send({ type: 'move', from: f, to: t });
    await A.state(r => r.moves.length === i + 1);
  }
  const fin = await B.state(r => r.moves.length === seq.length);
  assert.equal(fin.room.fen, g.fen());
  assert.equal(fin.room.status, 'over');
  assert.deepEqual(fin.room.result, { winner: 'r', reason: 'checkmate' });
  // không thể đi tiếp sau khi hết ván
  B.send({ type: 'move', from: sq(0, 4), to: sq(1, 4) });
  await B.wait(m => m.type === 'error');
  A.close(); B.close();
});
