// Kiểm thử kho người dùng: file JSON (luôn chạy) và Postgres (chạy khi đặt TEST_DATABASE_URL)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore, JsonStore, PgStore } = require('../lib/store');

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
    return { s, a, f };
  } catch (e) { await s.close(); throw e; }
}

test('Kho JSON: tạo/cập nhật người dùng, thống kê, lưu bền qua khởi động lại', async (t) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-store-')), 'sub', 'users.json');
  const { s, a, f } = await suite(t, () => new JsonStore(file).init());
  await s.close();
  // đọc lại từ file
  const s2 = await new JsonStore(file).init();
  assert.equal((await s2.getUser(a.id)).wins, 26);
  assert.equal((await s2.getUser(f.id)).draws, 2);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).users.length, 3);
  await s2.close();
});

test('createStore: không có DATABASE_URL -> file JSON; có -> Postgres', () => {
  assert.ok(createStore({ USERS_FILE: '/tmp/x.json' }) instanceof JsonStore);
  const pg = createStore({ DATABASE_URL: 'postgres://u:p@localhost:5/db' });
  assert.ok(pg instanceof PgStore); pg.close();
});

const PGURL = process.env.TEST_DATABASE_URL;
test('Kho Postgres (TEST_DATABASE_URL)', { skip: !PGURL && 'đặt TEST_DATABASE_URL để chạy' }, async (t) => {
  const table = 'ct_test_' + Date.now();
  const { s, a } = await suite(t, () => new PgStore(PGURL, { table }).init());
  try {
    // init lần 2 không lỗi, dữ liệu còn nguyên
    const s2 = await new PgStore(PGURL, { table }).init();
    assert.equal((await s2.getUser(a.id)).wins, 26);
    await s2.close();
  } finally { await s.pool.query('DROP TABLE ' + table); await s.close(); }
});
