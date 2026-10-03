// "Đang trực tuyến": server đẩy số thành viên / khách / ván đang chơi / người đang tìm đối thủ qua WebSocket (gộp, chỉ gửi khi đổi)
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3986, SECRET = 'presence-secret';
Object.assign(process.env, { PORT: String(PORT), USERS_FILE: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-pr-')), 'users.json'), SESSION_SECRET: SECRET, PRESENCE_MS: '80' });
delete process.env.DATABASE_URL;
const { server, store } = require('../server.js');

const cookieFor = uid => {
  const d = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 3600e3 })).toString('base64url');
  return 'ct_session=' + d + '.' + crypto.createHmac('sha256', SECRET).update(d).digest('base64url');
};
const ALL = [];
class Client {
  constructor(token, uid) { this.token = token || crypto.randomUUID(); this.uid = uid; this.msgs = []; ALL.push(this); }
  open() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`ws://localhost:${PORT}/ws`, this.uid ? { headers: { cookie: cookieFor(this.uid) } } : {});
      this.ws.on('open', () => { this.send({ type: 'hello', token: this.token, name: 'x' }); });
      this.ws.on('error', rej);
      this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); if (m.type === 'welcome') res(this); });
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  get presence() { const p = this.msgs.filter(m => m.type === 'presence'); return p[p.length - 1]; }
  close() { return new Promise(r => { this.ws.once('close', r); this.ws.close(); }); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const view = p => p && { users: p.users, guests: p.guests, playing: p.playing, searching: p.searching };
async function expectP(c, want, ms = 2000) {
  const t = Date.now();
  while (JSON.stringify(view(c.presence)) !== JSON.stringify(want)) {
    if (Date.now() - t > ms) assert.deepEqual(view(c.presence), want);
    await sleep(15);
  }
}
const S0 = { standard: 0, jieqi: 0 };
let n = 0;
const newUser = () => store.upsertOAuthUser({ provider: 'google', providerId: 'pr-' + (++n), name: 'Người ' + n });

test.before(() => new Promise(r => server.listening ? r() : server.once('listening', r)));
test.after(() => { for (const c of ALL) c.ws && c.ws.terminate(); if (server.closeAllConnections) server.closeAllConnections(); server.close(); });

test('Đếm thành viên / khách (không trùng thẻ), ván đang chơi, người đang tìm theo kiểu cờ; cập nhật khi vào/ra', async () => {
  const g1 = await new Client().open();
  // người mới vào nhận số liệu ngay khi chào
  assert.deepEqual(view(g1.presence), { users: 0, guests: 1, playing: 0, searching: S0 });
  const g1b = await new Client(g1.token).open(); // cùng khách, thẻ thứ 2
  const g2 = await new Client().open();
  await expectP(g1, { users: 0, guests: 2, playing: 0, searching: S0 });
  const u = await newUser(), v = await newUser();
  const a1 = await new Client(null, u.id).open(), a2 = await new Client(null, u.id).open(); // 1 tài khoản, 2 thẻ
  const b1 = await new Client(null, v.id).open();
  await expectP(g2, { users: 2, guests: 2, playing: 0, searching: S0 });
  // đang tìm đối thủ theo kiểu cờ
  a1.send({ type: 'mm_join', variant: 'jieqi' });
  await expectP(g1, { users: 2, guests: 2, playing: 0, searching: { standard: 0, jieqi: 1 } });
  a1.send({ type: 'mm_leave' });
  await expectP(g1, { users: 2, guests: 2, playing: 0, searching: S0 });
  // ván đang chơi: phòng có đủ 2 người
  g1.send({ type: 'create', color: 'r' }); const cr = await (async () => { for (;;) { const m = g1.msgs.find(x => x.type === 'created'); if (m) return m; await sleep(10); } })();
  await sleep(150); assert.equal(g1.presence.playing, 0, 'phòng mới có 1 người: chưa tính');
  g2.send({ type: 'join', roomId: cr.roomId });
  await expectP(b1, { users: 2, guests: 2, playing: 1, searching: S0 });
  // ghép trận tạo thêm 1 ván
  a1.send({ type: 'mm_join', variant: 'standard' }); b1.send({ type: 'mm_join', variant: 'standard' });
  await expectP(g1b, { users: 2, guests: 2, playing: 2, searching: S0 });
  // xin thua -> ván kết thúc
  g1.send({ type: 'resign' });
  await expectP(a2, { users: 2, guests: 2, playing: 1, searching: S0 });
  // ra về: thẻ thứ 2 vẫn còn -> vẫn tính
  await a1.close();
  await sleep(200); assert.equal(g2.presence.users, 2, 'tài khoản còn mở thẻ khác');
  await b1.close(); // ván ghép trận còn 0 người chơi kết nối -> không tính "đang chơi"
  await expectP(g2, { users: 1, guests: 2, playing: 0, searching: S0 });
  await g1.close(); await sleep(200); assert.equal(g2.presence.guests, 2, 'khách g1 còn thẻ khác');
  await g1b.close();
  await expectP(g2, { users: 1, guests: 1, playing: 0, searching: S0 });
  // /health có cùng số liệu
  const h = await (await fetch(`http://localhost:${PORT}/health`)).json();
  assert.deepEqual(h.presence, { users: 1, guests: 1, playing: 0, searching: S0 });
  await a2.close(); await g2.close();
});

test('Gộp thay đổi: nhiều người vào cùng lúc chỉ gửi ít tin; số liệu không đổi thì không gửi', async () => {
  const w = await new Client().open();
  await sleep(200);
  const before = w.msgs.filter(m => m.type === 'presence').length;
  const many = await Promise.all(Array.from({ length: 12 }, () => new Client().open()));
  await sleep(300);
  const got = w.msgs.filter(m => m.type === 'presence').length - before;
  assert.ok(got >= 1 && got <= 3, 'số tin presence nhận được: ' + got);
  assert.equal(w.presence.guests, 13);
  // gửi tin không làm đổi số liệu (chat ngoài phòng bị bỏ qua) -> không có presence mới
  const k = w.msgs.length; w.send({ type: 'mm_leave' }); await sleep(250);
  assert.equal(w.msgs.slice(k).filter(m => m.type === 'presence').length, 0);
  for (const c of many) await c.close();
  await expectP(w, { users: 0, guests: 1, playing: 0, searching: S0 });
  await w.close();
});
