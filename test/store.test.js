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
});

const PGURL = process.env.TEST_DATABASE_URL;
test('Kho Postgres (TEST_DATABASE_URL)', { skip: !PGURL && 'đặt TEST_DATABASE_URL để chạy' }, async (t) => {
  const table = 'ct_test_' + Date.now();
  const { s, a } = await suite(t, () => new PgStore(PGURL, { table }).init());
  try {
    // init lần 2 không lỗi, dữ liệu còn nguyên
    const s2 = await new PgStore(PGURL, { table }).init();
    assert.equal((await s2.getUser(a.id)).wins, 26);
    assert.equal((await s2.getUser(a.id)).ratings.standard.rating, 1218);
    await s2.close();
  } finally { await s.pool.query(`DROP TABLE ${table}_ratings; DROP TABLE ${table}`); await s.close(); }
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
  } finally { await pool.query(`DROP TABLE IF EXISTS ${table}_ratings; DROP TABLE IF EXISTS ${table}`); await pool.end(); }
});
