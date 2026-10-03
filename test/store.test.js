// Kiểm thử kho người dùng: file JSON (luôn chạy) và Postgres (chạy khi đặt TEST_DATABASE_URL)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore, JsonStore, PgStore, cleanBody } = require('../lib/store');

async function suite(t, make) {
  const s = await make();
  try {
    const a = await s.upsertOAuthUser({ provider: 'google', providerId: '111', name: 'Huy Đinh', avatar: 'https://x.test/a.png' });
    assert.match(a.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual([a.provider, a.providerId, a.name, a.avatar, a.wins, a.losses, a.draws], ['google', '111', 'Huy Đinh', 'https://x.test/a.png', 0, 0, 0]);
    assert.ok(!isNaN(Date.parse(a.createdAt)));
    // cùng provider + providerId -> cùng người, cập nhật tên/ảnh, giữ id + ngày tạo
    await s.recordResult(a.id, 'win');
    const a2 = await s.upsertOAuthUser({ provider: 'google', providerId: '111', name: 'Huy', avatar: '' });
    assert.equal(a2.id, a.id); assert.equal(a2.name, 'Huy'); assert.equal(a2.avatar, ''); assert.equal(a2.wins, 1); assert.equal(a2.createdAt, a.createdAt);
    // cùng providerId nhưng khác provider -> người khác
    const f = await s.upsertOAuthUser({ provider: 'facebook', providerId: '111', name: 'Lan', avatar: 'http://khong-an-toan/x.png' });
    assert.notEqual(f.id, a.id); assert.equal(f.avatar, '', 'ảnh không phải https bị bỏ');
    // thống kê
    await s.recordResult(f.id, 'loss'); await s.recordResult(f.id, 'draw'); await s.recordResult(f.id, 'draw');
    assert.deepEqual(await s.getUser(f.id).then(u => [u.wins, u.losses, u.draws]), [0, 1, 2]);
    // ghi đồng thời không mất lượt
    await Promise.all(Array.from({ length: 25 }, () => s.recordResult(a.id, 'win')));
    assert.equal((await s.getUser(a.id)).wins, 26);
    assert.equal(await s.getUser('khong-ton-tai'), null);
    assert.equal(await s.recordResult('00000000-0000-0000-0000-000000000000', 'win'), null);
    await assert.rejects(() => s.recordResult(a.id, 'abc'));
    await assert.rejects(() => s.upsertOAuthUser({ provider: 'google', providerId: '' }));
    const long = await s.upsertOAuthUser({ provider: 'google', providerId: '222', name: 'x'.repeat(100) + '\u0007' });
    assert.equal(long.name.length, 40);
    // Elo theo từng kiểu cờ: mặc định 1200, 0 ván
    assert.deepEqual(a2.ratings, { standard: { rating: 1200, games: 0 }, jieqi: { rating: 1200, games: 0 } });
    const r1 = await s.recordRatedGame({ r: a.id, b: f.id, variant: 'standard', winner: 'r' });
    assert.deepEqual(r1, { r: { before: 1200, after: 1220, delta: 20, games: 1 }, b: { before: 1200, after: 1180, delta: -20, games: 1 } });
    const r2 = await s.recordRatedGame({ r: f.id, b: a.id, variant: 'standard', winner: null });
    assert.equal(r2.r.before, 1180); assert.equal(r2.b.before, 1220); assert.equal(r2.r.delta, 2); assert.equal(r2.b.delta, -2);
    await s.recordRatedGame({ r: a.id, b: f.id, variant: 'jieqi', winner: 'b' });
    const ga = await s.getUser(a.id), gf = await s.getUser(f.id);
    assert.deepEqual(ga.ratings, { standard: { rating: 1218, games: 2 }, jieqi: { rating: 1180, games: 1 } });
    assert.deepEqual(gf.ratings, { standard: { rating: 1182, games: 2 }, jieqi: { rating: 1220, games: 1 } });
    assert.equal(ga.wins, 26, 'Elo không đụng tới thống kê thắng/thua');
    // nhiều ván kết thúc cùng lúc: không mất lượt cập nhật
    await Promise.all(Array.from({ length: 10 }, () => s.recordRatedGame({ r: long.id, b: f.id, variant: 'standard', winner: null })));
    assert.equal((await s.getUser(long.id)).ratings.standard.games, 10);
    assert.equal((await s.getUser(f.id)).ratings.standard.games, 12);
    await assert.rejects(() => s.recordRatedGame({ r: a.id, b: a.id, variant: 'standard', winner: 'r' }), /khác nhau/);
    await assert.rejects(() => s.recordRatedGame({ r: a.id, b: f.id, variant: 'chess', winner: 'r' }), /kiểu cờ/);
    await assert.rejects(() => s.recordRatedGame({ r: a.id, b: f.id, variant: 'standard', winner: 'x' }));
    assert.equal(await s.recordRatedGame({ r: a.id, b: '00000000-0000-0000-0000-000000000000', variant: 'standard', winner: 'r' }), null);
    assert.equal((await s.getUser(a.id)).ratings.standard.games, 2, 'đối thủ không tồn tại: không đổi gì');
    return { s, a, f };
  } catch (e) { await s.close(); throw e; }
}

// Tin nhắn riêng + chặn (chạy cho cả JSON và Postgres)
async function msgSuite(s) {
  const u1 = await s.upsertOAuthUser({ provider: 'google', providerId: 'm1', name: 'Một' });
  const u2 = await s.upsertOAuthUser({ provider: 'facebook', providerId: 'm2', name: 'Hai' });
  const u3 = await s.upsertOAuthUser({ provider: 'google', providerId: 'm3', name: 'Ba' });
  const NOBODY = '00000000-0000-4000-8000-000000000000';
  const m1 = await s.sendMessage({ from: u1.id, to: u2.id, body: '  Chào <b>bạn</b>\u0007  ' });
  assert.deepEqual([m1.from, m1.to, m1.body, m1.readAt], [u1.id, u2.id, 'Chào <b>bạn</b>', null], 'lưu nguyên văn (escape ở phía hiển thị), bỏ ký tự điều khiển');
  assert.ok(m1.id > 0 && !isNaN(Date.parse(m1.createdAt)));
  const m2 = await s.sendMessage({ from: u2.id, to: u1.id, body: 'Dòng 1\r\nDòng 2' });
  assert.equal(m2.body, 'Dòng 1\nDòng 2');
  await s.sendMessage({ from: u3.id, to: u1.id, body: 'x'.repeat(800) }).then(m => assert.equal(m.body.length, 500, 'tối đa 500 ký tự'));
  await s.sendMessage({ from: u1.id, to: u2.id, body: 'Ván nữa không?' });
  assert.equal(await s.sendMessage({ from: u1.id, to: NOBODY, body: 'hi' }), null, 'người nhận không tồn tại');
  await assert.rejects(() => s.sendMessage({ from: u1.id, to: u2.id, body: '   ' }), /rỗng/);
  await assert.rejects(() => s.sendMessage({ from: u1.id, to: u1.id, body: 'hi' }), /tự nhắn/);
  // hộp thư
  const c1 = await s.listConversations(u1.id);
  assert.deepEqual(c1.map(c => [c.peer, c.unread, c.last.body]), [[u2.id, 1, 'Ván nữa không?'], [u3.id, 1, 'x'.repeat(500)]]);
  assert.equal(c1[0].last.from, u1.id);
  const c2 = await s.listConversations(u2.id);
  assert.deepEqual(c2.map(c => [c.peer, c.unread]), [[u1.id, 2]]);
  assert.equal(await s.unreadCount(u2.id), 2); assert.equal(await s.unreadCount(u1.id), 2);
  // luồng tin: cũ -> mới, phân trang
  const th = await s.getThread(u2.id, u1.id);
  assert.deepEqual(th.map(m => m.body), ['Chào <b>bạn</b>', 'Dòng 1\nDòng 2', 'Ván nữa không?']);
  assert.deepEqual((await s.getThread(u2.id, u1.id, { limit: 2 })).map(m => m.body), ['Dòng 1\nDòng 2', 'Ván nữa không?']);
  assert.deepEqual((await s.getThread(u2.id, u1.id, { before: th[1].id })).map(m => m.body), ['Chào <b>bạn</b>']);
  assert.deepEqual(await s.getThread(u3.id, u2.id), [], 'người ngoài không thấy');
  // đánh dấu đã đọc
  assert.equal(await s.markRead(u2.id, u1.id), 2);
  assert.equal(await s.markRead(u2.id, u1.id), 0);
  assert.equal(await s.unreadCount(u2.id), 0);
  assert.ok((await s.getThread(u1.id, u2.id)).filter(m => m.from === u1.id).every(m => m.readAt));
  assert.equal(await s.unreadCount(u1.id), 2, 'đọc ở phía u2 không ảnh hưởng u1');
  // chặn
  assert.equal(await s.isBlocked(u2.id, u3.id), false);
  assert.equal(await s.block(u2.id, u3.id), true);
  assert.equal(await s.block(u2.id, u3.id), true, 'chặn lại lần nữa không lỗi');
  assert.equal(await s.block(u2.id, u2.id), false);
  assert.equal(await s.block(u2.id, NOBODY), false);
  assert.equal(await s.isBlocked(u2.id, u3.id), true);
  assert.equal(await s.isBlocked(u3.id, u2.id), false, 'chặn một chiều');
  assert.deepEqual(await s.listBlocked(u2.id), [u3.id]);
  assert.equal(await s.unblock(u2.id, u3.id), true);
  assert.equal(await s.unblock(u2.id, u3.id), false);
  assert.deepEqual(await s.listBlocked(u2.id), []);
  await s.block(u1.id, u3.id);
  // nhiều tin cùng lúc không mất
  await Promise.all(Array.from({ length: 15 }, (_, i) => s.sendMessage({ from: u3.id, to: u2.id, body: 'n' + i })));
  assert.equal(await s.unreadCount(u2.id), 15);
  return { u1, u2, u3 };
}

test('cleanBody: bỏ ký tự điều khiển, giữ xuống dòng, cắt 500 ký tự (không cắt đôi emoji)', () => {
  assert.equal(cleanBody(' a\u0000b\tc \n\n\n\nd '), 'abc \n\nd');
  assert.equal(cleanBody('😀'.repeat(600)), '😀'.repeat(500));
  assert.equal(cleanBody(null), '');
});

test('Kho JSON: tin nhắn riêng + chặn, lưu bền qua khởi động lại', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-msg-')), 'users.json');
  const s = await new JsonStore(file).init();
  const { u1, u2, u3 } = await msgSuite(s);
  await s.close();
  const s2 = await new JsonStore(file).init();
  assert.equal(await s2.unreadCount(u2.id), 15);
  assert.equal(await s2.isBlocked(u1.id, u3.id), true);
  const m = await s2.sendMessage({ from: u1.id, to: u2.id, body: 'sau khởi động lại' });
  assert.ok(m.id > 19, 'id tiếp tục tăng: ' + m.id);
  assert.equal((await s2.getThread(u1.id, u2.id)).length, 4);
  await s2.close();
});

test('Kho JSON: tạo/cập nhật người dùng, thống kê, lưu bền qua khởi động lại', async (t) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-store-')), 'sub', 'users.json');
  const { s, a, f } = await suite(t, () => new JsonStore(file).init());
  await s.close();
  // đọc lại từ file
  const s2 = await new JsonStore(file).init();
  assert.equal((await s2.getUser(a.id)).wins, 26);
  assert.equal((await s2.getUser(f.id)).draws, 2);
  assert.deepEqual((await s2.getUser(a.id)).ratings, { standard: { rating: 1218, games: 2 }, jieqi: { rating: 1180, games: 1 } }, 'Elo lưu bền');
  // file cũ (chưa có Elo) vẫn đọc được, Elo mặc định
  const old = path.join(path.dirname(file), 'old.json');
  fs.writeFileSync(old, JSON.stringify({ users: [{ id: 'u-old', provider: 'google', providerId: '9', name: 'Cũ', avatar: '', createdAt: new Date().toISOString(), wins: 3, losses: 1, draws: 0 }] }));
  const s3 = await new JsonStore(old).init();
  const o = await s3.getUser('u-old');
  assert.deepEqual([o.wins, o.ratings.standard.rating, o.ratings.jieqi.games], [3, 1200, 0]);
  await s3.close();
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).users.length, 3);
  await s2.close();
});

test('createStore: không có DATABASE_URL -> file JSON; có -> Postgres', () => {
  assert.ok(createStore({ USERS_FILE: '/tmp/x.json' }) instanceof JsonStore);
  const pg = createStore({ DATABASE_URL: 'postgres://u:p@localhost:5/db' });
  assert.ok(pg instanceof PgStore); pg.close();
  assert.deepEqual([pg.table, pg.mtable, pg.btable], ['cotuong_users', 'cotuong_messages', 'cotuong_blocks'], 'tên bảng mặc định');
});

const PGURL = process.env.TEST_DATABASE_URL;
test('Kho Postgres (TEST_DATABASE_URL)', { skip: !PGURL && 'đặt TEST_DATABASE_URL để chạy' }, async (t) => {
  const table = 'ct_test_' + Date.now();
  const { s, a } = await suite(t, () => new PgStore(PGURL, { table }).init());
  try {
    const { u1, u2, u3 } = await msgSuite(s);
    assert.equal(s.mtable, table + '_messages'); assert.equal(s.btable, table + '_blocks');
    // xoá người dùng -> tin nhắn + chặn của họ bị xoá theo
    await s.pool.query(`DELETE FROM ${table} WHERE id = $1`, [u3.id]);
    assert.equal(await s.unreadCount(u2.id), 0); assert.deepEqual(await s.listBlocked(u1.id), []);
    // init lần 2 không lỗi, dữ liệu còn nguyên
    const s2 = await new PgStore(PGURL, { table }).init();
    assert.equal((await s2.getUser(a.id)).wins, 26);
    assert.equal((await s2.getUser(a.id)).ratings.standard.rating, 1218);
    await s2.close();
  } finally { await s.pool.query(`DROP TABLE ${table}_messages, ${table}_blocks, ${table}_ratings; DROP TABLE ${table}`); await s.close(); }
});

test('Postgres: bảng người dùng cũ (chưa có Elo) được nâng cấp an toàn, không mất dữ liệu', { skip: !PGURL && 'đặt TEST_DATABASE_URL để chạy' }, async () => {
  const table = 'ct_old_' + Date.now();
  const { Pool } = require('pg'); const pool = new Pool({ connectionString: PGURL });
  try {
    // lược đồ của bản trước
    await pool.query(`CREATE TABLE ${table} (id uuid PRIMARY KEY, provider text NOT NULL, provider_id text NOT NULL, name text NOT NULL, avatar text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(), wins integer NOT NULL DEFAULT 0, losses integer NOT NULL DEFAULT 0, draws integer NOT NULL DEFAULT 0, UNIQUE (provider, provider_id))`);
    await pool.query(`INSERT INTO ${table} (id, provider, provider_id, name, wins, losses, draws) VALUES ('11111111-1111-1111-1111-111111111111', 'google', 'old', 'Người cũ', 7, 2, 1)`);
    const s = await new PgStore(PGURL, { table }).init();
    const u = await s.getUser('11111111-1111-1111-1111-111111111111');
    assert.deepEqual([u.name, u.wins, u.losses, u.draws], ['Người cũ', 7, 2, 1]);
    assert.deepEqual(u.ratings.standard, { rating: 1200, games: 0 });
    const v = await s.upsertOAuthUser({ provider: 'google', providerId: 'new', name: 'Mới' });
    await s.recordRatedGame({ r: v.id, b: u.id, variant: 'jieqi', winner: 'b' });
    assert.equal((await s.getUser(u.id)).ratings.jieqi.rating, 1220);
    assert.equal((await s.getUser(u.id)).wins, 7);
    await s.close();
    // khởi động lại lần nữa: giữ nguyên
    const s2 = await new PgStore(PGURL, { table }).init();
    assert.equal((await s2.getUser(u.id)).ratings.jieqi.rating, 1220);
    await s2.close();
  } finally { await pool.query(`DROP TABLE IF EXISTS ${table}_messages, ${table}_blocks, ${table}_ratings; DROP TABLE IF EXISTS ${table}`); await pool.end(); }
});
