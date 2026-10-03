/* Cờ tướng online – server Express + WebSocket (ws). Trạng thái phòng lưu trong bộ nhớ. */
'use strict';
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const X = require('./shared/xiangqi');
const { createStore } = require('./lib/store');
const { createAuth } = require('./lib/auth');

const PORT = +process.env.PORT || 3000;
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render/Fly đứng sau proxy https

// Tài khoản (tuỳ chọn): Google / Facebook. Không cấu hình gì thì chỉ có chế độ khách như trước.
const store = createStore(process.env);
const storeReady = store.init().catch(e => console.error('[store] không khởi tạo được kho người dùng:', e.message));
const auth = createAuth({ env: process.env, store });
app.use(auth.router);
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
// Trang pháp lý (cần cho màn hình xác thực OAuth của Google/Facebook) + bí danh tiếng Anh
const LEGAL = { '/privacy': 'chinh-sach-bao-mat', '/privacy-policy': 'chinh-sach-bao-mat', '/terms': 'dieu-khoan', '/data-deletion': 'xoa-du-lieu' };
for (const [alias, page] of Object.entries(LEGAL)) app.get(alias, (req, res) => res.sendFile(path.join(__dirname, 'public', page + '.html')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size, uptime: process.uptime() | 0 }));
app.get('/r/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

/** @type {Map<string, any>} */
const rooms = new Map();
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRoomId() {
  let id;
  do { id = Array.from(crypto.randomBytes(6), b => ALPHA[b % ALPHA.length]).join(''); } while (rooms.has(id));
  return id;
}
// Kiểu cờ: 'standard' (cờ tướng) | 'jieqi' (cờ úp). Cờ úp: server giữ mặt thật quân úp (game.secret), chỉ gửi quân đã lật.
const VARIANTS = new Set(['standard', 'jieqi']);
const secureRand = () => crypto.randomInt(0, 2 ** 31) / 2 ** 31;
function makeGame(variant) { return variant === 'jieqi' ? X.createGame('jieqi', X.randomDeal(secureRand)) : new X.Game(); }
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);

function createRoom(opts) {
  const minutes = Math.max(0, Math.min(90, +opts.minutes || 0));
  const inc = Math.max(0, Math.min(60, +opts.increment || 0));
  const variant = VARIANTS.has(opts.variant) ? opts.variant : 'standard';
  const room = {
    id: newRoomId(), createdAt: Date.now(), lastActive: Date.now(),
    seats: { r: null, b: null }, clients: new Set(), variant,
    game: makeGame(variant), status: 'waiting', result: null, pending: null, chat: [], gameNo: 1,
    timeControl: minutes ? { base: minutes * 60000, inc: inc * 1000 } : null,
    clocks: { r: minutes * 60000, b: minutes * 60000 }, turnStart: 0,
  };
  rooms.set(room.id, room);
  return room;
}

function seatOf(room, token) {
  if (room.seats.r && room.seats.r.token === token) return 'r';
  if (room.seats.b && room.seats.b.token === token) return 'b';
  return null;
}
function online(room, token) { for (const c of room.clients) if (c.token === token) return true; return false; }
function clockRunning(room) {
  return room.timeControl && room.status === 'playing' && room.game.history.length > 0 ? room.game.turn : null;
}
function liveClocks(room) {
  const c = { r: room.clocks.r, b: room.clocks.b }, run = clockRunning(room);
  if (run) c[run] = Math.max(0, c[run] - (Date.now() - room.turnStart));
  return c;
}

function snapshot(room, ws) {
  const g = room.game;
  const seat = s => room.seats[s] ? { name: room.seats[s].name, online: online(room, room.seats[s].token) } : null;
  let spectators = 0;
  for (const c of room.clients) if (!seatOf(room, c.token)) spectators++;
  return {
    type: 'state',
    room: {
      id: room.id, variant: room.variant, gameNo: room.gameNo, status: room.status, result: room.result, pending: room.pending,
      seats: { r: seat('r'), b: seat('b') }, spectators,
      fen: g.fen(), turn: g.turn, check: g.inCheck(),
      // chỉ thông tin công khai: rv = mặt quân vừa lật, cap = quân bị ăn (quân úp bị ăn được lật ra)
      moves: g.history.map(m => {
        const o = { from: m.from, to: m.to, n: m.notation, side: m.side, cap: m.capReal || m.captured, check: m.check };
        if (m.reveal) o.rv = m.reveal;
        return o;
      }),
      timeControl: room.timeControl, clocks: liveClocks(room), running: clockRunning(room),
    },
    you: { color: seatOf(room, ws.token), name: ws.name },
  };
}

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(room) { room.lastActive = Date.now(); for (const c of room.clients) send(c, snapshot(room, c)); }
function notify(room, text, except) { for (const c of room.clients) if (c !== except) send(c, { type: 'toast', text }); }

function finish(room, winner, reason) {
  if (room.timeControl && room.status === 'playing') room.clocks = liveClocks(room);
  room.status = 'over'; room.result = { winner, reason }; room.pending = null;
  recordStats(room, winner);
}

// Cập nhật thắng/thua/hoà cho người chơi đã đăng nhập (mỗi ván 1 lần, ván phải có ít nhất 2 nước)
function recordStats(room, winner) {
  if (room.statsFor === room.gameNo) return;
  room.statsFor = room.gameNo;
  const r = room.seats.r, b = room.seats.b;
  if (!r || !b || room.game.history.length < 2) return;
  if (r.uid && r.uid === b.uid) return; // cùng một tài khoản tự đánh với mình
  for (const c of ['r', 'b']) {
    const uid = room.seats[c].uid; if (!uid) continue;
    const res = winner == null ? 'draw' : winner === c ? 'win' : 'loss';
    store.recordResult(uid, res).then(u => {
      if (!u) return;
      for (const ws of room.clients) if (ws.userId === uid) { ws.user = u; send(ws, { type: 'account', user: auth.publicUser(u) }); }
    }).catch(e => console.error('[store] recordResult', e.message));
  }
}

function startIfReady(room) {
  if (room.status === 'waiting' && room.seats.r && room.seats.b) { room.status = 'playing'; room.turnStart = Date.now(); }
}

function newGame(room) {
  // đổi màu cho ván mới
  const r = room.seats.r; room.seats.r = room.seats.b; room.seats.b = r;
  room.game = makeGame(room.variant); room.result = null; room.pending = null; room.gameNo++;
  room.status = 'waiting';
  if (room.timeControl) room.clocks = { r: room.timeControl.base, b: room.timeControl.base };
  startIfReady(room);
}

function joinRoom(ws, room) {
  if (ws.room && ws.room !== room) leaveRoom(ws);
  ws.room = room; room.clients.add(ws);
  if (!seatOf(room, ws.token)) {
    // tự động ngồi vào ghế trống nếu có
    const free = !room.seats.r ? 'r' : !room.seats.b ? 'b' : null;
    if (free && room.status !== 'over') {
      room.seats[free] = { token: ws.token, name: ws.name, uid: ws.userId || null };
      notify(room, `${ws.name} đã vào phòng (${free === 'r' ? 'quân Đỏ' : 'quân Đen'})`, ws);
    } else notify(room, `${ws.name} vào xem`, ws);
  } else {
    const seat = room.seats[seatOf(room, ws.token)];
    seat.name = ws.name; seat.uid = ws.userId || null;
  }
  startIfReady(room);
  send(ws, { type: 'chat_history', messages: room.chat.map(m => chatOut(m, ws)) });
  broadcast(room);
}

function leaveRoom(ws) {
  const room = ws.room; if (!room) return;
  room.clients.delete(ws); ws.room = null;
  broadcast(room);
}

function chatOut(m, ws) { return { name: m.name, color: m.color, text: m.text, ts: m.ts, mine: m.tok === ws.token }; }
function addChat(room, msg) {
  room.chat.push(msg); if (room.chat.length > 100) room.chat.shift();
  for (const c of room.clients) send(c, { type: 'chat', message: chatOut(msg, c) });
}

const handlers = {
  hello(ws, m) {
    ws.token = clean(m.token, 64) || crypto.randomUUID();
    // đã đăng nhập: dùng tên tài khoản; khách: tên tự nhập như trước
    ws.name = (ws.user && clean(ws.user.name, 24)) || clean(m.name, 24) || 'Kỳ thủ ' + ws.token.slice(0, 4);
    ws.userId = ws.user ? ws.user.id : null;
    send(ws, { type: 'welcome', token: ws.token });
  },
  create(ws, m) {
    const room = createRoom(m);
    let color = m.color === 'b' ? 'b' : m.color === 'r' ? 'r' : (Math.random() < 0.5 ? 'r' : 'b');
    room.seats[color] = { token: ws.token, name: ws.name, uid: ws.userId || null };
    joinRoom(ws, room);
    send(ws, { type: 'created', roomId: room.id });
  },
  join(ws, m) {
    const room = rooms.get(clean(m.roomId, 12).toUpperCase());
    if (!room) return send(ws, { type: 'error', code: 'no_room', text: 'Không tìm thấy phòng. Có thể phòng đã hết hạn.' });
    joinRoom(ws, room);
  },
  leave(ws) { leaveRoom(ws); },
  sit(ws, m, room) {
    const c = m.color === 'b' ? 'b' : 'r';
    if (room.seats[c] || seatOf(room, ws.token) || room.status === 'playing') return;
    room.seats[c] = { token: ws.token, name: ws.name, uid: ws.userId || null };
    notify(room, `${ws.name} ngồi vào ${c === 'r' ? 'quân Đỏ' : 'quân Đen'}`, ws);
    startIfReady(room); broadcast(room);
  },
  stand(ws, m, room) {
    const c = seatOf(room, ws.token);
    if (!c || room.status === 'playing') return;
    room.seats[c] = null; broadcast(room);
  },
  move(ws, m, room) {
    const c = seatOf(room, ws.token);
    if (room.status !== 'playing') return send(ws, { type: 'error', text: 'Ván cờ chưa bắt đầu hoặc đã kết thúc.' });
    if (c !== room.game.turn) return send(ws, { type: 'error', text: 'Chưa đến lượt bạn.' });
    // kiểm tra trước khi trừ giờ; luật cấm chiếu dai áp dụng cho cả ván online
    const err = room.game.moveError(m.from, m.to);
    if (err === 'perpetual') { send(ws, { type: 'error', text: X.PERPETUAL_MSG }); return broadcast(room); }
    if (err) { send(ws, { type: 'error', text: 'Nước đi không hợp lệ.' }); return broadcast(room); }
    const now = Date.now();
    if (room.timeControl && room.game.history.length > 0) {
      room.clocks[c] -= now - room.turnStart;
      if (room.clocks[c] <= 0) { room.clocks[c] = 0; finish(room, X.other(c), 'timeout'); return broadcast(room); }
    }
    const rec = room.game.move(m.from, m.to);
    if (!rec) { send(ws, { type: 'error', text: 'Nước đi không hợp lệ.' }); return broadcast(room); }
    if (room.timeControl && room.game.history.length > 1) room.clocks[c] += room.timeControl.inc;
    room.turnStart = now; room.pending = null;
    const st = room.game.status();
    if (st.over) finish(room, st.winner, st.reason);
    broadcast(room);
  },
  undo_request(ws, m, room) {
    const c = seatOf(room, ws.token);
    if (!c || room.status !== 'playing' || room.pending) return;
    if (!room.game.history.some(h => h.side === c)) return send(ws, { type: 'error', text: 'Bạn chưa đi nước nào để xin đi lại.' });
    room.pending = { type: 'undo', by: c }; broadcast(room);
  },
  draw_offer(ws, m, room) {
    const c = seatOf(room, ws.token);
    if (!c || room.status !== 'playing' || room.pending) return;
    room.pending = { type: 'draw', by: c }; broadcast(room);
  },
  rematch(ws, m, room) {
    const c = seatOf(room, ws.token);
    if (!c || room.pending) return;
    if (room.status === 'waiting' && room.game.history.length === 0) return;
    if (!room.seats[X.other(c)]) { newGame(room); return broadcast(room); }
    room.pending = { type: 'rematch', by: c }; broadcast(room);
  },
  respond(ws, m, room) {
    const c = seatOf(room, ws.token), p = room.pending;
    if (!c || !p || p.by === c) return;
    room.pending = null;
    const who = room.seats[c].name;
    if (!m.accept) {
      const label = { undo: 'xin đi lại', draw: 'cầu hoà', rematch: 'chơi ván mới' }[p.type];
      notify(room, `${who} từ chối ${label}.`);
      return broadcast(room);
    }
    if (p.type === 'undo' && room.status === 'playing') {
      const g = room.game;
      const last = g.history[g.history.length - 1];
      g.undo();
      if (last.side !== p.by && g.history.length) g.undo();
      room.turnStart = Date.now();
      notify(room, 'Đã đồng ý cho đi lại.');
    } else if (p.type === 'draw' && room.status === 'playing') {
      finish(room, null, 'agreement');
    } else if (p.type === 'rematch') {
      newGame(room); notify(room, 'Ván mới bắt đầu – hai bên đã đổi màu quân.');
    }
    broadcast(room);
  },
  cancel(ws, m, room) {
    if (room.pending && room.pending.by === seatOf(room, ws.token)) { room.pending = null; broadcast(room); }
  },
  resign(ws, m, room) {
    const c = seatOf(room, ws.token);
    if (!c || room.status !== 'playing') return;
    finish(room, X.other(c), 'resign'); broadcast(room);
  },
  chat(ws, m, room) {
    const text = clean(m.text, 300); if (!text) return;
    const now = Date.now();
    if (ws.lastChat && now - ws.lastChat < 400) return; ws.lastChat = now;
    addChat(room, { name: ws.name, color: seatOf(room, ws.token), text, ts: now, tok: ws.token });
  },
};
const NEEDS_ROOM = new Set(['sit', 'stand', 'move', 'undo_request', 'draw_offer', 'rematch', 'respond', 'cancel', 'resign', 'chat']);

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  // đọc phiên đăng nhập từ cookie (nếu có); tin nhắn được xử lý tuần tự sau khi biết người dùng
  ws.ready = storeReady.then(() => auth.userFromCookieHeader(req.headers.cookie)).then(u => { ws.user = u; }, () => { ws.user = null; });
  ws.on('message', data => { ws.ready = ws.ready.then(() => onMessage(ws, data)); });
  ws.on('close', () => leaveRoom(ws));
});
function onMessage(ws, data) {
  let m; try { m = JSON.parse(data); } catch { return; }
  if (!m || typeof m.type !== 'string' || !handlers.hasOwnProperty(m.type)) return;
  if (m.type !== 'hello' && !ws.token) return send(ws, { type: 'error', text: 'Chưa xác thực.' });
  if (NEEDS_ROOM.has(m.type) && !ws.room) return;
  try { handlers[m.type](ws, m, ws.room); } catch (e) { console.error('handler error', m.type, e); }
}

// Hết giờ & heartbeat & dọn phòng
const clockTimer = setInterval(() => {
  for (const room of rooms.values()) {
    const run = clockRunning(room);
    if (run && liveClocks(room)[run] <= 0) { finish(room, X.other(run), 'timeout'); room.clocks[run] = 0; broadcast(room); }
  }
}, 250);
const pingTimer = setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
  const now = Date.now();
  for (const [id, room] of rooms) if (!room.clients.size && now - room.lastActive > 12 * 3600e3) rooms.delete(id);
}, 25000);
clockTimer.unref(); pingTimer.unref(); // server.listen giữ tiến trình; cho phép đóng gọn khi kiểm thử trong cùng tiến trình

server.listen(PORT, () => console.log(`Cờ tướng online đang chạy tại http://localhost:${PORT}`));
module.exports = { server, rooms };
