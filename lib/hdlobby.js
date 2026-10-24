'use strict';
/*
 * Sảnh online cho huydinh.info/cotuong (đường dẫn WebSocket /hd). Chỉ khách (không đăng nhập), tách riêng
 * khỏi /ws. Hàng đợi riêng cho cờ tướng (std) và cờ úp (up), tự ghép 1-1, màu ngẫu nhiên, kiểm tra nước đi
 * ở server bằng shared/xiangqi.js, đồng hồ 10 phút + 5 giây/nước, xin thua / cầu hoà / ván mới, khán giả.
 */
const { WebSocketServer } = require('ws');
const X = require('../shared/xiangqi');
const DISC_MS = 45e3;
// Thời gian theo quy định Liên đoàn Cờ tướng Thế giới (WXF): tiêu chuẩn 60'+30", cờ nhanh 10'+5", cờ chớp 5'+3"
const TC = { std: { base: 3600e3, inc: 30e3 }, rapid: { base: 600e3, inc: 5e3 }, blitz: { base: 300e3, inc: 3e3 } };
const tcOf = x => (TC[x] ? x : 'std');
const wss = new WebSocketServer({ noServer: true, maxPayload: 65536 });
const queues = {}; for (const v of ['std', 'up']) for (const k in TC) queues[v + ':' + k] = [];
const tables = new Map();
let seq = 1;
let deps = { store: null, auth: null, ready: Promise.resolve() };
const PH_MAX = 12, PH_LEN = 40;
function cleanPrefs(d) {
  if (!d || typeof d !== 'object') return null; const o = {};
  if (Array.isArray(d.phrases)) o.phrases = d.phrases.filter(x => typeof x === 'string').map(x => x.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, PH_LEN)).filter(Boolean).slice(0, PH_MAX);
  if (typeof d.name === 'string') o.name = clean(d.name);
  if (typeof d.avatar === 'string') { const a = cleanAv(d.avatar); if (a) o.avatar = a; }
  return o;
}
const send = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
const cleanAv = a => { a = String(a || ''); if (/^b:[0-9]{1,2}$/.test(a)) return a; if (a.length <= 20000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a)) return a; return ''; };
const clean = s => String(s || '').replace(/[<>&"'`\u0000-\u001f]/g, '').trim().slice(0, 20) || 'Khách' + (Math.random() * 9000 + 1000 | 0);
const tid = () => (seq++).toString(36).toUpperCase().padStart(3, '0') + Math.random().toString(36).slice(2, 5).toUpperCase();

function counts() {
  let online = 0; for (const c of wss.clients) if (c.readyState === 1 && c.hd) online++;
  let spect = 0, playing = { std: 0, up: 0 };
  for (const t of tables.values()) { spect += t.watchers.size; if (!t.over) playing[t.variant]++; }
  return { online, spectators: spect, queue: qcount(), playing };
}
function qcount() { const q = { std: 0, up: 0, byTc: {} }; for (const k in queues) { const [v, tc] = k.split(':'); q[v] += queues[k].length; q.byTc[k] = queues[k].length; } return q; }
let pTimer = null;
function presence() { if (pTimer) return; pTimer = setTimeout(() => { pTimer = null; const m = { type: 'presence', ...counts(), tables: list() }; for (const c of wss.clients) if (c.hd) send(c, m); }, 400); }
function list() {
  return [...tables.values()].filter(t => !t.over || Date.now() - t.endedAt < 60e3).slice(-30).map(t => ({
    id: t.id, variant: t.variant, tc: t.tc, red: t.names.r, black: t.names.b, moves: t.game.history.length, watchers: t.watchers.size, over: !!t.over }));
}
function publicBoard(g) { return g.board.slice(); }
function clocks(t) { const c = { ...t.clock }; if (!t.over && t.game.history.length > 0) c[t.game.turn] -= Date.now() - t.turnStart; return c; }
function stateFor(t, side) {
  const g = t.game, st = g.status(), last = g.history[g.history.length - 1];
  return { type: 'state', id: t.id, variant: t.variant, tc: t.tc, inc: TC[t.tc].inc, you: side || null, names: t.names, avatars: t.avatars, board: publicBoard(g), turn: g.turn,
    last: last ? [last.from, last.to] : null, check: st.check, clock: clocks(t), started: g.history.length > 0,
    moves: side && side === g.turn && !t.over ? g.moves().map(m => [m.from, m.to]) : [], over: t.over || null,
    offer: t.offer || null, rematch: [...t.rematch], conn: { r: !!(t.ws.r && t.ws.r.readyState === 1), b: !!(t.ws.b && t.ws.b.readyState === 1) },
    watchers: t.watchers.size, moveCount: g.history.length };
}
function broadcast(t) { send(t.ws.r, stateFor(t, 'r')); send(t.ws.b, stateFor(t, 'b')); const s = stateFor(t, null); for (const w of t.watchers) send(w, s); }
function end(t, winner, reason) { if (t.over) return; if (t.game.history.length) t.clock[t.game.turn] -= Date.now() - t.turnStart; t.over = { winner, reason }; t.endedAt = Date.now(); clearTimeout(t.flag); broadcast(t); presence(); }
function armFlag(t) {
  clearTimeout(t.flag); if (t.over || !t.game.history.length) return;
  t.flag = setTimeout(() => { if (clocks(t)[t.game.turn] <= 0) { t.clock[t.game.turn] = 0; end(t, X.other(t.game.turn), 'timeout'); } else armFlag(t); }, Math.max(50, clocks(t)[t.game.turn] + 20));
}
function newGame(t) {
  t.game = t.variant === 'up' ? X.createGame('jieqi', X.randomDeal(Math.random)) : X.createGame('standard');
  t.clock = { r: TC[t.tc].base, b: TC[t.tc].base }; t.turnStart = Date.now(); t.over = null; t.offer = null; t.rematch = new Set(); clearTimeout(t.flag);
}
function makeTable(a, b, variant, tc) {
  const red = Math.random() < .5 ? a : b, black = red === a ? b : a;
  const t = { id: tid(), variant, tc, ws: { r: red, b: black }, names: { r: red.hdName, b: black.hdName }, avatars: { r: red.hdAv || '', b: black.hdAv || '' }, watchers: new Set(), created: Date.now(), tokens: { r: Math.random().toString(36).slice(2), b: Math.random().toString(36).slice(2) } };
  newGame(t); tables.set(t.id, t);
  for (const [s, w] of [['r', red], ['b', black]]) { w.table = t; w.side = s; send(w, { type: 'matched', id: t.id, you: s, variant, tc, opponent: t.names[X.other(s)], token: t.tokens[s] }); }
  broadcast(t); presence();
}
function dequeue(ws) { for (const k in queues) { const i = queues[k].indexOf(ws); if (i >= 0) queues[k].splice(i, 1); } ws.queued = null; }
function tryMatch(key) { const q = queues[key], [v, tc] = key.split(':'); while (q.length >= 2) { const a = q.shift(), b = q.shift(); a.queued = b.queued = null; if (a.readyState !== 1) { q.unshift(b); continue; } if (b.readyState !== 1) { q.unshift(a); continue; } makeTable(a, b, v, tc); } }
function leaveTable(ws, resign) {
  const t = ws.table; if (!t) return; ws.table = null;
  if (ws.side) { if (resign && !t.over) end(t, X.other(ws.side), 'left'); t.ws[ws.side] = null; ws.side = null; broadcast(t); }
  else t.watchers.delete(ws);
  if (!t.ws.r && !t.ws.b && !t.watchers.size) { clearTimeout(t.flag); setTimeout(() => { if (!t.ws.r && !t.ws.b) tables.delete(t.id); presence(); }, 60e3); }
  presence();
}
function onMsg(ws, m) {
  const t = ws.table, me = ws.side;
  switch (m.type) {
    case 'login': {
      const uid = deps.auth && typeof m.token === 'string' && m.token.length < 600 ? deps.auth.hdUserId(m.token) : null;
      if (!uid) return send(ws, { type: 'account', user: null, error: 'token' });
      deps.ready.then(() => Promise.all([deps.store.getUser(uid), deps.store.getPrefs(uid)])).then(([u, p]) => {
        if (!u) return send(ws, { type: 'account', user: null, error: 'nouser' });
        ws.uid = uid; send(ws, { type: 'account', user: { id: u.id, name: u.name, provider: u.provider }, prefs: p || null });
      }, e => { console.error('hd login', e.message); send(ws, { type: 'account', user: null, error: 'db' }); });
      return;
    }
    case 'logout': ws.uid = null; return send(ws, { type: 'account', user: null });
    case 'prefs_set': {
      if (!ws.uid) return send(ws, { type: 'error', msg: 'Chưa đăng nhập.' });
      const now = Date.now(); ws.prefTimes = (ws.prefTimes || []).filter(x => now - x < 10e3); if (ws.prefTimes.length >= 5) return; ws.prefTimes.push(now);
      const d = cleanPrefs(m.data); if (!d) return;
      deps.ready.then(() => deps.store.setPrefs(ws.uid, d)).then(() => send(ws, { type: 'prefs_saved', prefs: d }), e => console.error('hd prefs', e.message));
      return;
    }
    case 'hello': ws.hdName = clean(m.name); ws.hdAv = cleanAv(m.avatar); send(ws, { type: 'hi', name: ws.hdName }); presence();
      if (m.resume && tables.has(m.resume.id)) { const r = tables.get(m.resume.id); const s = m.resume.side; if ((s === 'r' || s === 'b') && r.tokens && r.tokens[s] === m.resume.token) { const old = r.ws[s]; if (old && old !== ws) { old.table = null; old.side = null; try { old.terminate(); } catch { } } r.ws[s] = ws; ws.table = r; ws.side = s; clearTimeout(r.disc && r.disc[s]); broadcast(r); } }
      return;
    case 'queue': { const v = m.variant === 'up' ? 'up' : 'std', key = v + ':' + tcOf(m.tc); if (!ws.hdName) ws.hdName = clean(m.name); if (ws.table) leaveTable(ws, true); dequeue(ws); ws.queued = v; queues[key].push(ws); send(ws, { type: 'queued', variant: v, tc: tcOf(m.tc) }); tryMatch(key); presence(); return; }
    case 'cancel': dequeue(ws); send(ws, { type: 'cancelled' }); presence(); return;
    case 'list': send(ws, { type: 'presence', ...counts(), tables: list() }); return;
    case 'watch': { const w = tables.get(String(m.id)); if (!w) return send(ws, { type: 'error', msg: 'Bàn không còn.' }); dequeue(ws); if (ws.table) leaveTable(ws, true); ws.table = w; ws.side = null; w.watchers.add(ws); broadcast(w); presence(); return; }
    case 'leave': leaveTable(ws, true); return;
  }
  if (m.type === 'chat' && t) {
    const text = String(m.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120); if (!text) return;
    const now = Date.now(); ws.chatTimes = (ws.chatTimes || []).filter(x => now - x < 10e3);
    if (ws.chatTimes.length >= 5) return send(ws, { type: 'error', msg: 'Gửi chậm lại một chút nhé.' });
    ws.chatTimes.push(now);
    const msg = { type: 'chat', from: ws.hdName, side: me || null, spectator: !me, text, at: now };
    t.chat = (t.chat || []).concat(msg).slice(-50);
    for (const w of [t.ws.r, t.ws.b, ...t.watchers]) send(w, msg); return;
  }
  if (m.type === 'chat_history' && t) return send(ws, { type: 'chat_history', items: t.chat || [] });
  if (!t || !me) return;
  const opp = X.other(me);
  if (m.type === 'rtc') { // tín hiệu WebRTC (offer/answer/ice/mic) chỉ chuyển cho đối thủ
    const d = m.data; if (!d || typeof d !== 'object' || JSON.stringify(d).length > 3500) return;
    return send(t.ws[opp], { type: 'rtc', data: d });
  }
  switch (m.type) {
    case 'move': {
      if (t.over || t.game.turn !== me) return send(ws, { type: 'error', msg: 'Chưa tới lượt.' });
      const err = t.game.moveError(m.from, m.to); if (err) return send(ws, { type: 'error', msg: err === 'perpetual' ? X.PERPETUAL_MSG : 'Nước đi không hợp lệ.' }), broadcast(t);
      const now = Date.now(), first = !t.game.history.length;
      if (!first) { t.clock[me] -= now - t.turnStart; if (t.clock[me] <= 0) { t.clock[me] = 0; return end(t, opp, 'timeout'); } t.clock[me] += TC[t.tc].inc; }
      t.game.move(+m.from, +m.to); t.turnStart = now; t.offer = null;
      const st = t.game.status(); if (st.over) return end(t, st.winner, st.reason);
      armFlag(t); broadcast(t); presence(); return;
    }
    case 'resign': if (!t.over) end(t, opp, 'resign'); return;
    case 'draw_offer': if (!t.over) { t.offer = me; broadcast(t); } return;
    case 'draw_reply': if (!t.over && t.offer === opp) { if (m.accept) end(t, null, 'agreed'); else { t.offer = null; broadcast(t); } } return;
    case 'rematch': if (!t.over) return; t.rematch.add(me);
      if (t.rematch.has(opp) && t.ws[opp]) { const r = t.ws.r, b = t.ws.b; t.ws = { r: b, b: r }; t.names = { r: t.names.b, b: t.names.r }; t.avatars = { r: t.avatars.b, b: t.avatars.r }; t.tokens = { r: t.tokens.b, b: t.tokens.r }; r.side = 'b'; b.side = 'r'; newGame(t); for (const s of ['r', 'b']) send(t.ws[s], { type: 'matched', id: t.id, you: s, variant: t.variant, opponent: t.names[X.other(s)], rematch: true, token: t.tokens[s] }); }
      broadcast(t); return;
  }
}
wss.on('connection', ws => {
  ws.on('error', e => { console.warn('hd ws error', e && e.code || e && e.message); try { ws.terminate(); } catch { } });
  ws.hd = true; ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', d => { let m; try { m = JSON.parse(d); } catch { return; } if (m && typeof m.type === 'string') try { onMsg(ws, m); } catch (e) { console.error('hd', e); } });
  ws.on('close', () => {
    dequeue(ws); const t = ws.table;
    if (t && ws.side && !t.over) { const s = ws.side; t.ws[s] = null; ws.table = null; broadcast(t);
      t.disc = t.disc || {}; t.disc[s] = setTimeout(() => { if (!t.ws[s] && !t.over) end(t, X.other(s), 'disconnect'); }, DISC_MS); presence(); }
    else leaveTable(ws, false);
    presence();
  });
  send(ws, { type: 'presence', ...counts(), tables: list() });
});
wss.on('error', e => console.warn('hd wss error', e && e.message));
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 25e3).unref();
module.exports = {
  init(d) { deps = { ...deps, ...d }; },
  handle(req, socket, head) { wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)); },
  counts,
};
