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
const { Matchmaker, allowedGap } = require('./lib/matchmaker');
const { publicProfile, miniProfile } = require('./lib/profile');
const { cleanBody, MSG_MAX } = require('./lib/store');

const PORT = +process.env.PORT || 3000;
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render/Fly đứng sau proxy https
// Tên miền cũ (vd cotuong-online-6qpn.onrender.com) -> 301 về PUBLIC_URL (https://cotuongvn.net), giữ đường dẫn + truy vấn (link /r/MÃ vẫn chạy)
app.use(require('./lib/canonical').canonicalRedirect(process.env.PUBLIC_URL));

// Tài khoản (tuỳ chọn): Google / Facebook. Không cấu hình gì thì chỉ có chế độ khách như trước.
const store = createStore(process.env);
const storeReady = store.init().catch(e => console.error('[store] không khởi tạo được kho người dùng:', e.message));
const auth = createAuth({ env: process.env, store });
app.use(auth.router);
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
// Trang pháp lý (cần cho màn hình xác thực OAuth của Google/Facebook) + bí danh tiếng Anh
const LEGAL = { '/privacy': 'chinh-sach-bao-mat', '/privacy-policy': 'chinh-sach-bao-mat', '/terms': 'dieu-khoan', '/data-deletion': 'xoa-du-lieu' };
for (const [alias, page] of Object.entries(LEGAL)) app.get(alias, (req, res) => res.sendFile(path.join(__dirname, 'public', page + '.html')));
// Bản tiếng Anh đầy đủ: /en/privacy, /en/terms, /en/data-deletion (file tĩnh public/en/*.html; thêm bí danh /en/privacy-policy)
app.get('/en/privacy-policy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'en', 'privacy.html')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size, queue: mm.size, presence: presence(), uptime: process.uptime() | 0 }));
app.get('/r/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------------- Thông tin người chơi + tin nhắn riêng (HTTP) ----------------
const ID_RE = /^[0-9a-f-]{36}$/i;
const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
app.use('/api/players', noStore); app.use('/api/messages', noStore); app.use('/api/blocks', noStore);
app.get('/api/players/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!ID_RE.test(id)) return res.status(404).json({ error: 'not_found' });
  try { await storeReady; const u = await store.getUser(id); return u ? res.json({ player: publicProfile(u) }) : res.status(404).json({ error: 'not_found' }); }
  catch (e) { console.error('[api] player', e.message); res.status(500).json({ error: 'server' }); }
});
/** Người dùng đang đăng nhập (theo cookie phiên) hoặc trả 401 */
async function meOr401(req, res) {
  await storeReady;
  const u = await auth.userFromCookieHeader(req.headers.cookie);
  if (!u) { res.status(401).json({ error: 'login', text: 'Cần đăng nhập để dùng tin nhắn.' }); return null; }
  return u;
}
const api = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => { console.error('[api]', req.path, e.message); if (!res.headersSent) res.status(500).json({ error: 'server' }); });
app.get('/api/messages', api(async (req, res) => {
  const me = await meOr401(req, res); if (!me) return;
  const [convs, blocked, unread] = await Promise.all([store.listConversations(me.id), store.listBlocked(me.id), store.unreadCount(me.id)]);
  const peers = await Promise.all(convs.map(c => store.getUser(c.peer)));
  const bl = new Set(blocked);
  res.json({ unread, blocked, conversations: convs.map((c, i) => ({ peer: miniProfile(peers[i]) || { id: c.peer, name: 'Người chơi đã xoá', avatar: '', deleted: true }, last: c.last, unread: c.unread, blocked: bl.has(c.peer) })) });
}));
app.get('/api/messages/:peer', api(async (req, res) => {
  const me = await meOr401(req, res); if (!me) return;
  const peerId = String(req.params.peer);
  const peer = ID_RE.test(peerId) && peerId !== me.id ? await store.getUser(peerId) : null;
  if (!peer) return res.status(404).json({ error: 'not_found' });
  const messages = await store.getThread(me.id, peer.id, { before: req.query.before, limit: req.query.limit });
  const read = await store.markRead(me.id, peer.id);
  if (read) pushUnread(me.id);
  res.json({ peer: publicProfile(peer), blocked: await store.isBlocked(me.id, peer.id), messages, max: MSG_MAX });
}));
// chặn / bỏ chặn: cần header riêng (trang khác không gửi được header này nếu không qua CORS) -> chống CSRF
const blockRoute = on => api(async (req, res) => {
  if (req.get('x-ct-csrf') !== '1') return res.status(403).json({ error: 'csrf' });
  const me = await meOr401(req, res); if (!me) return;
  const peerId = String(req.params.peer);
  if (!ID_RE.test(peerId) || peerId === me.id || !(await store.getUser(peerId))) return res.status(404).json({ error: 'not_found' });
  if (on) await store.block(me.id, peerId); else await store.unblock(me.id, peerId);
  res.json({ ok: true, blocked: await store.isBlocked(me.id, peerId) });
});
app.post('/api/blocks/:peer', blockRoute(true));
app.delete('/api/blocks/:peer', blockRoute(false));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

/** @type {Map<string, any>} */
const rooms = new Map();
// Ghép trận tự động (chỉ người đã đăng nhập). Ván ghép trận được tính Elo; phòng tự tạo thì không.
const mm = new Matchmaker();
const MM_TIME = { minutes: 10, increment: 5 };                  // thời gian ván xếp hạng: 10 phút + 5 giây/nước
const ABANDON_MS = Math.max(1000, +process.env.ABANDON_MS || 60000); // ván xếp hạng: mất kết nối quá lâu -> xử thua
let wsSeq = 0;
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
  const seat = s => {
    const st = room.seats[s]; if (!st) return null;
    const o = { name: st.name, online: online(room, st.token) };
    if (st.uid) o.id = st.uid; // người đã đăng nhập: id công khai để mở thẻ "Thông tin người chơi"; khách không có
    if (room.rated && st.uid && room.ratingOf && room.ratingOf[st.uid] != null) o.rating = room.ratingOf[st.uid];
    return o;
  };
  let spectators = 0;
  for (const c of room.clients) if (!seatOf(room, c.token)) spectators++;
  return {
    type: 'state',
    room: {
      id: room.id, variant: room.variant, rated: !!room.rated, gameNo: room.gameNo, status: room.status, result: room.result, pending: room.pending,
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
const DM_RATE = Math.max(1, +process.env.DM_RATE || 10), DM_WINDOW_MS = Math.max(1000, +process.env.DM_WINDOW_MS || 30000);
const dmTimes = new Map(); // uid -> thời điểm các tin gần đây (giới hạn tốc độ)
setInterval(() => { const now = Date.now(); for (const [k, v] of dmTimes) if (!v.some(t => now - t < DM_WINDOW_MS)) dmTimes.delete(k); }, 60000).unref();
/** Gửi số tin chưa đọc mới nhất tới mọi thẻ của người dùng */
function pushUnread(uid) {
  store.unreadCount(uid).then(n => { for (const c of wss.clients) if (c.userId === uid) send(c, { type: 'dm_unread', count: n }); }, () => { });
}
function broadcast(room) { room.lastActive = Date.now(); for (const c of room.clients) send(c, snapshot(room, c)); }
// Thông báo trong phòng: text tiếng Việt (tương thích client cũ) + key/params để client dịch theo ngôn ngữ của người xem
function notify(room, text, except, key, params) { for (const c of room.clients) if (c !== except) send(c, key ? { type: 'toast', text, key, params } : { type: 'toast', text }); }
const errMsg = (code, text, extra) => ({ type: 'error', code, key: 'err.' + code, text, ...extra });

function finish(room, winner, reason) {
  if (room.timeControl && room.status === 'playing') room.clocks = liveClocks(room);
  room.status = 'over'; room.result = { winner, reason }; room.pending = null;
  recordStats(room, winner);
  schedulePresence();
}

// Cập nhật thắng/thua/hoà cho người chơi đã đăng nhập (mỗi ván 1 lần, ván phải có ít nhất 2 nước)
function recordStats(room, winner) {
  if (room.statsFor === room.gameNo) return;
  room.statsFor = room.gameNo;
  const r = room.seats.r, b = room.seats.b;
  if (!r || !b || room.game.history.length < 2) return;
  if (r.uid && r.uid === b.uid) return; // cùng một tài khoản tự đánh với mình
  // Elo: chỉ ván trong phòng ghép trận, đúng hai tài khoản đã được ghép
  const rated = room.rated && r.uid && b.uid && room.ratingOf && room.ratingOf[r.uid] != null && room.ratingOf[b.uid] != null;
  const ratedP = !rated ? Promise.resolve() : store.recordRatedGame({ r: r.uid, b: b.uid, variant: room.variant, winner }).then(res => {
    if (!res) return;
    for (const c of ['r', 'b']) {
      const uid = c === 'r' ? r.uid : b.uid;
      room.ratingOf[uid] = res[c].after;
      for (const ws of wss.clients) if (ws.userId === uid) send(ws, { type: 'rating', variant: room.variant, roomId: room.id, ...res[c] });
    }
    broadcast(room);
  }).catch(e => console.error('[store] recordRatedGame', e.message));
  ratedP.then(() => {
    for (const c of ['r', 'b']) {
      const uid = c === 'r' ? r.uid : b.uid; if (!uid) continue;
      const res = winner == null ? 'draw' : winner === c ? 'win' : 'loss';
      store.recordResult(uid, res).then(u => {
        if (!u) return;
        for (const ws of wss.clients) if (ws.userId === uid) { ws.user = u; send(ws, { type: 'account', user: auth.publicUser(u) }); }
      }).catch(e => console.error('[store] recordResult', e.message));
    }
  });
}

// ---------------- Đang trực tuyến (đẩy qua WebSocket, gộp nhiều thay đổi trong PRESENCE_MS) ----------------
// users = số tài khoản khác nhau đang mở trang, guests = số khách khác nhau (theo token trình duyệt; nhiều thẻ = 1),
// playing = số phòng đang có ván diễn ra (còn người chơi kết nối), playingBy = số ván đó theo kiểu cờ (Cờ tướng / Cờ úp),
// searching = số tài khoản đang tìm đối thủ theo kiểu cờ.
const PRESENCE_MS = Math.max(50, +process.env.PRESENCE_MS || 600);
function presence() {
  const users = new Set(), guests = new Set();
  for (const ws of wss.clients) {
    if (ws.readyState !== 1 || !ws.token) continue;
    if (ws.userId) users.add(ws.userId); else guests.add(ws.token);
  }
  for (const t of guests) for (const ws of wss.clients) if (ws.token === t && ws.userId && ws.readyState === 1) { guests.delete(t); break; } // khách vừa đăng nhập ở thẻ khác
  let playing = 0;
  const playingBy = { standard: 0, jieqi: 0 };
  for (const room of rooms.values()) { // ván đang diễn ra và còn ít nhất một người chơi đang kết nối
    if (room.status === 'playing' && ['r', 'b'].some(c => room.seats[c] && online(room, room.seats[c].token))) {
      playing++; playingBy[room.variant === 'jieqi' ? 'jieqi' : 'standard']++;
    }
  }
  const searching = { standard: new Set(), jieqi: new Set() };
  for (const e of mm.queue.values()) if (searching[e.variant]) searching[e.variant].add(e.uid);
  return { users: users.size, guests: guests.size, playing, playingBy, searching: { standard: searching.standard.size, jieqi: searching.jieqi.size } };
}
let presenceTimer = null, presenceLast = '';
function schedulePresence() {
  if (presenceTimer) return;
  presenceTimer = setTimeout(() => {
    presenceTimer = null;
    const p = presence(), json = JSON.stringify(p);
    if (json === presenceLast) return; // không đổi thì không gửi
    presenceLast = json;
    const msg = JSON.stringify({ type: 'presence', ...p });
    for (const ws of wss.clients) if (ws.readyState === 1 && ws.token) ws.send(msg);
  }, PRESENCE_MS);
  presenceTimer.unref();
}

// ---------------- Ghép trận ----------------
function mmStatus(ws, extra) {
  const e = ws.mmKey != null && mm.get(ws.mmKey);
  send(ws, e ? { type: 'mm_status', state: 'searching', variant: e.variant, rating: e.rating, waited: mm.waitMs(e), gap: gapOut(mm.gapFor(e)), ...extra }
    : { type: 'mm_status', state: 'idle', ...extra });
}
const gapOut = g => (g === Infinity ? null : g);
function mmCancel(ws, reason) { if (ws.mmKey != null && mm.remove(ws.mmKey)) mmStatus(ws, reason ? { reason } : undefined); }
function runMatch() {
  for (const [a, b] of mm.tick()) {
    const wa = a.data, wb = b.data;
    if (wa.readyState !== 1 || wb.readyState !== 1) { // một bên vừa rời: người còn lại tiếp tục chờ, giữ thời gian chờ
      for (const e of [a, b]) if (e.data.readyState === 1) mm.add({ ...e, since: e.since });
      continue;
    }
    startMatch(a, b);
  }
}
function startMatch(a, b) {
  const room = createRoom({ variant: a.variant, ...MM_TIME });
  room.rated = true;
  room.ratingOf = { [a.uid]: a.rating, [b.uid]: b.rating };
  const first = crypto.randomInt(2) ? 'r' : 'b'; // màu quân ngẫu nhiên
  const colorOf = new Map([[a, first], [b, X.other(first)]]);
  for (const e of [a, b]) room.seats[colorOf.get(e)] = { token: e.data.token, name: e.data.name, uid: e.uid };
  for (const [e, o] of [[a, b], [b, a]]) {
    send(e.data, { type: 'mm_found', roomId: room.id, variant: room.variant, color: colorOf.get(e), rating: e.rating,
      opponent: { id: o.uid, name: o.data.name, rating: o.rating }, timeControl: room.timeControl });
  }
  for (const e of [a, b]) joinRoom(e.data, room);
  return room;
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
      notify(room, `${ws.name} đã vào phòng (${free === 'r' ? 'quân Đỏ' : 'quân Đen'})`, ws, 'ts.joined', { name: ws.name, color: free });
    } else notify(room, `${ws.name} vào xem`, ws, 'ts.watch', { name: ws.name });
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
    send(ws, { type: 'presence', ...presence() }); // người mới vào thấy ngay, những người khác nhận sau (gộp)
    if (ws.userId) return store.unreadCount(ws.userId).then(n => send(ws, { type: 'dm_unread', count: n }), () => { });
  },
  // Tin nhắn riêng: chỉ giữa hai người đã đăng nhập; tối đa MSG_MAX ký tự; giới hạn DM_RATE tin / DM_WINDOW_MS; tôn trọng danh sách chặn
  async dm_send(ws, m) {
    const fail = (code, text) => send(ws, { type: 'dm_error', cid: m.cid, code, key: 'dme.' + code, text, max: MSG_MAX });
    if (!ws.userId) return fail('login', 'Đăng nhập để nhắn tin.');
    if (!ws.sameOrigin) return fail('origin', 'Không gửi được tin nhắn.');
    const to = clean(m.to, 64), raw = String(m.body == null ? '' : m.body);
    if (Array.from(raw.trim()).length > MSG_MAX) return fail('too_long', 'Tin nhắn tối đa ' + MSG_MAX + ' ký tự.');
    const body = cleanBody(raw);
    if (!body) return fail('empty', 'Tin nhắn trống.');
    if (!ID_RE.test(to) || to === ws.userId) return fail('no_user', 'Không tìm thấy người nhận.');
    const now = Date.now(), times = (dmTimes.get(ws.userId) || []).filter(t => now - t < DM_WINDOW_MS);
    if (times.length >= DM_RATE) { dmTimes.set(ws.userId, times); return fail('rate', 'Bạn gửi nhanh quá – đợi một chút rồi gửi tiếp nhé.'); }
    const [peer, blockedMe, iBlocked] = await Promise.all([store.getUser(to), store.isBlocked(to, ws.userId), store.isBlocked(ws.userId, to)]);
    if (!peer) return fail('no_user', 'Không tìm thấy người nhận.');
    if (blockedMe) return fail('blocked', 'Bạn không thể nhắn tin cho người này.');
    if (iBlocked) return fail('you_blocked', 'Bạn đã chặn người này – bỏ chặn để nhắn tin.');
    times.push(now); dmTimes.set(ws.userId, times);
    const msg = await store.sendMessage({ from: ws.userId, to, body });
    if (!msg) return fail('no_user', 'Không tìm thấy người nhận.');
    const me = miniProfile(ws.user), them = miniProfile(peer);
    for (const c of wss.clients) {
      if (c.readyState !== 1) continue;
      if (c.userId === to) send(c, { type: 'dm', msg, peer: me });
      else if (c.userId === ws.userId) send(c, { type: 'dm', msg, peer: them, ...(c === ws ? { cid: m.cid } : {}) });
    }
    pushUnread(to);
  },
  async dm_read(ws, m) {
    const peer = clean(m.peer, 64);
    if (!ws.userId || !ID_RE.test(peer)) return;
    if (await store.markRead(ws.userId, peer)) pushUnread(ws.userId);
  },
  create(ws, m) {
    mmCancel(ws);
    const room = createRoom({ minutes: m.minutes, increment: m.increment, variant: m.variant });
    let color = m.color === 'b' ? 'b' : m.color === 'r' ? 'r' : (Math.random() < 0.5 ? 'r' : 'b');
    room.seats[color] = { token: ws.token, name: ws.name, uid: ws.userId || null };
    joinRoom(ws, room);
    send(ws, { type: 'created', roomId: room.id });
  },
  join(ws, m) {
    const room = rooms.get(clean(m.roomId, 12).toUpperCase());
    if (!room) return send(ws, errMsg('no_room', 'Không tìm thấy phòng. Có thể phòng đã hết hạn.'));
    mmCancel(ws);
    joinRoom(ws, room);
  },
  leave(ws) { leaveRoom(ws); },
  async mm_join(ws, m) {
    if (!ws.userId) return send(ws, errMsg('mm_login', 'Đăng nhập để tìm đối thủ tự động.'));
    const variant = VARIANTS.has(m.variant) ? m.variant : 'standard';
    const u = await store.getUser(ws.userId);
    if (!u) return send(ws, errMsg('mm_login', 'Đăng nhập để tìm đối thủ tự động.'));
    if (ws.readyState !== 1) return;
    ws.user = u;
    // cùng một tài khoản chỉ được tìm ở một nơi: huỷ lượt tìm ở thẻ/thiết bị khác
    for (const old of mm.removeUser(u.id, ws.mmKey)) if (old.data !== ws) mmStatus(old.data, { reason: 'other_tab' });
    mm.add({ key: ws.mmKey, uid: u.id, name: ws.name, rating: u.ratings[variant].rating, variant, data: ws });
    mmStatus(ws);
    runMatch();
  },
  mm_leave(ws) { mm.remove(ws.mmKey); mmStatus(ws); },
  sit(ws, m, room) {
    const c = m.color === 'b' ? 'b' : 'r';
    if (room.seats[c] || seatOf(room, ws.token) || room.status === 'playing') return;
    room.seats[c] = { token: ws.token, name: ws.name, uid: ws.userId || null };
    notify(room, `${ws.name} ngồi vào ${c === 'r' ? 'quân Đỏ' : 'quân Đen'}`, ws, 'ts.sat', { name: ws.name, color: c });
    startIfReady(room); broadcast(room);
  },
  stand(ws, m, room) {
    const c = seatOf(room, ws.token);
    if (!c || room.status === 'playing') return;
    room.seats[c] = null; broadcast(room);
  },
  move(ws, m, room) {
    const c = seatOf(room, ws.token);
    if (room.status !== 'playing') return send(ws, errMsg('not_playing', 'Ván cờ chưa bắt đầu hoặc đã kết thúc.'));
    if (c !== room.game.turn) return send(ws, errMsg('not_your_turn', 'Chưa đến lượt bạn.'));
    // kiểm tra trước khi trừ giờ; luật cấm chiếu dai áp dụng cho cả ván online
    const err = room.game.moveError(m.from, m.to);
    if (err === 'perpetual') { send(ws, errMsg('perpetual', X.PERPETUAL_MSG)); return broadcast(room); }
    if (err) { send(ws, errMsg('invalid_move', 'Nước đi không hợp lệ.')); return broadcast(room); }
    const now = Date.now();
    if (room.timeControl && room.game.history.length > 0) {
      room.clocks[c] -= now - room.turnStart;
      if (room.clocks[c] <= 0) { room.clocks[c] = 0; finish(room, X.other(c), 'timeout'); return broadcast(room); }
    }
    const rec = room.game.move(m.from, m.to);
    if (!rec) { send(ws, errMsg('invalid_move', 'Nước đi không hợp lệ.')); return broadcast(room); }
    if (room.timeControl && room.game.history.length > 1) room.clocks[c] += room.timeControl.inc;
    room.turnStart = now; room.pending = null;
    const st = room.game.status();
    if (st.over) finish(room, st.winner, st.reason);
    broadcast(room);
  },
  undo_request(ws, m, room) {
    const c = seatOf(room, ws.token);
    if (!c || room.status !== 'playing' || room.pending) return;
    if (!room.game.history.some(h => h.side === c)) return send(ws, errMsg('no_undo', 'Bạn chưa đi nước nào để xin đi lại.'));
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
      notify(room, `${who} từ chối ${label}.`, null, 'ts.declined', { name: who, what: p.type });
      return broadcast(room);
    }
    if (p.type === 'undo' && room.status === 'playing') {
      const g = room.game;
      const last = g.history[g.history.length - 1];
      g.undo();
      if (last.side !== p.by && g.history.length) g.undo();
      room.turnStart = Date.now();
      notify(room, 'Đã đồng ý cho đi lại.', null, 'ts.undone');
    } else if (p.type === 'draw' && room.status === 'playing') {
      finish(room, null, 'agreement');
    } else if (p.type === 'rematch') {
      newGame(room); notify(room, 'Ván mới bắt đầu – hai bên đã đổi màu quân.', null, 'ts.rematch');
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
  ws.isAlive = true; ws.mmKey = ++wsSeq;
  // tin nhắn riêng chỉ nhận từ trang cùng nguồn (chống trang lạ mở WebSocket bằng cookie của người dùng)
  const origin = req.headers.origin;
  try { ws.sameOrigin = !origin || new URL(origin).host === req.headers.host; } catch { ws.sameOrigin = false; }
  ws.on('pong', () => { ws.isAlive = true; });
  // đọc phiên đăng nhập từ cookie (nếu có); tin nhắn được xử lý tuần tự sau khi biết người dùng
  ws.ready = storeReady.then(() => auth.userFromCookieHeader(req.headers.cookie)).then(u => { ws.user = u; }, () => { ws.user = null; });
  ws.on('message', data => { ws.ready = ws.ready.then(() => onMessage(ws, data)); });
  ws.on('close', () => { mm.remove(ws.mmKey); leaveRoom(ws); schedulePresence(); });
});
function onMessage(ws, data) {
  let m; try { m = JSON.parse(data); } catch { return; }
  if (!m || typeof m.type !== 'string' || !handlers.hasOwnProperty(m.type)) return;
  if (m.type !== 'hello' && !ws.token) return send(ws, errMsg('unauth', 'Chưa xác thực.'));
  if (NEEDS_ROOM.has(m.type) && !ws.room) return;
  try { return Promise.resolve(handlers[m.type](ws, m, ws.room)).catch(e => console.error('handler error', m.type, e)).finally(schedulePresence); }
  catch (e) { console.error('handler error', m.type, e); }
}

// Hết giờ & heartbeat & dọn phòng
const clockTimer = setInterval(() => {
  for (const room of rooms.values()) {
    const run = clockRunning(room);
    if (run && liveClocks(room)[run] <= 0) { finish(room, X.other(run), 'timeout'); room.clocks[run] = 0; broadcast(room); }
    if (room.rated) checkAbandon(room);
  }
}, 250);
const matchTimer = setInterval(runMatch, 1000);
// Ván xếp hạng: người chơi mất kết nối quá ABANDON_MS -> xử thua (chưa đủ 2 nước thì huỷ ván, không tính điểm)
function checkAbandon(room) {
  room.away = room.away || {};
  if (room.status !== 'playing') { room.away = {}; return; }
  const now = Date.now();
  for (const c of ['r', 'b']) {
    const st = room.seats[c];
    if (!st || online(room, st.token)) { delete room.away[c]; continue; }
    if (!room.away[c]) {
      room.away[c] = now;
      notify(room, `${st.name} mất kết nối – nếu không quay lại trong ${Math.round(ABANDON_MS / 1000)} giây sẽ bị xử thua.`, null, 'ts.away', { name: st.name, sec: Math.round(ABANDON_MS / 1000) });
    } else if (now - room.away[c] >= ABANDON_MS) {
      if (room.game.history.length < 2) finish(room, null, 'aborted'); else finish(room, X.other(c), 'abandon');
      room.away = {}; broadcast(room); return;
    }
  }
}
const pingTimer = setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
  const now = Date.now();
  for (const [id, room] of rooms) if (!room.clients.size && now - room.lastActive > 12 * 3600e3) { rooms.delete(id); schedulePresence(); }
}, 25000);
clockTimer.unref(); pingTimer.unref(); matchTimer.unref(); // server.listen giữ tiến trình; cho phép đóng gọn khi kiểm thử trong cùng tiến trình

server.listen(PORT, () => console.log(`Cờ tướng online đang chạy tại http://localhost:${PORT}`));
module.exports = { server, rooms, mm, store, runMatch };
