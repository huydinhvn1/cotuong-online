// Elo và hàng đợi ghép trận (thuần logic, không cần server)
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/rating');
const { Matchmaker, allowedGap } = require('../lib/matchmaker');

test('Elo: kỳ vọng, hệ số K, thắng/thua/hoà', () => {
  assert.equal(R.DEFAULT_RATING, 1200);
  assert.equal(R.expected(1200, 1200), 0.5);
  assert.ok(Math.abs(R.expected(1600, 1200) - 0.909) < 0.001);
  assert.equal(R.kFactor(0), 40); assert.equal(R.kFactor(19), 40); assert.equal(R.kFactor(20), 32); assert.equal(R.kFactor(300), 32);
  // người mới, ngang điểm: thắng +20 / thua -20
  let u = R.update({ rating: 1200, games: 0 }, { rating: 1200, games: 0 }, 1);
  assert.deepEqual(u, { a: { rating: 1220, games: 1, delta: 20 }, b: { rating: 1180, games: 1, delta: -20 } });
  // đã quá 20 ván: K = 32
  u = R.update({ rating: 1200, games: 20 }, { rating: 1200, games: 25 }, 0);
  assert.deepEqual([u.a.delta, u.b.delta, u.a.games, u.b.games], [-16, 16, 21, 26]);
  // mỗi bên dùng K của mình
  u = R.update({ rating: 1200, games: 3 }, { rating: 1200, games: 40 }, 1);
  assert.deepEqual([u.a.delta, u.b.delta], [20, -16]);
  // hoà: bên điểm cao mất điểm, bên thấp được điểm; ngang điểm thì không đổi
  u = R.update({ rating: 1400, games: 30 }, { rating: 1200, games: 30 }, 0.5);
  assert.deepEqual([u.a.delta, u.b.delta], [-8, 8]);
  assert.deepEqual(R.update({ rating: 1300, games: 5 }, { rating: 1300, games: 5 }, 0.5).a.delta, 0);
  // thắng người yếu hơn nhiều được ít điểm, thua thì mất nhiều
  assert.equal(R.update({ rating: 1800, games: 50 }, { rating: 1200, games: 50 }, 1).a.delta, 1);
  assert.equal(R.update({ rating: 1800, games: 50 }, { rating: 1200, games: 50 }, 0).a.delta, -31);
  assert.throws(() => R.update({ rating: 1200 }, { rating: 1200 }, 2));
  // điểm thiếu / hỏng -> mặc định
  assert.deepEqual(R.normalizeRatings(null), { standard: { rating: 1200, games: 0 }, jieqi: { rating: 1200, games: 0 } });
  assert.deepEqual(R.normalizeRatings({ jieqi: { rating: '1333.4', games: 7 }, x: 1 }), { standard: { rating: 1200, games: 0 }, jieqi: { rating: 1333, games: 7 } });
  assert.deepEqual(R.normalizeRatings({ standard: { rating: 'abc', games: -3 } }).standard, { rating: 1200, games: 0 });
});

test('Phạm vi chênh lệch: ±100, +50 mỗi 5 giây, không giới hạn sau 60 giây', () => {
  assert.equal(allowedGap(0), 100); assert.equal(allowedGap(4999), 100); assert.equal(allowedGap(5000), 150);
  assert.equal(allowedGap(12000), 200); assert.equal(allowedGap(55000), 650); assert.equal(allowedGap(59999), 650);
  assert.equal(allowedGap(60000), Infinity); assert.equal(allowedGap(-5), 100);
});

function mk() { let t = 1e6; const m = new Matchmaker({ now: () => t }); m.adv = ms => { t += ms; }; return m; }
const E = (key, uid, rating, variant = 'standard') => ({ key, uid, name: uid, rating, variant });
const ids = pairs => pairs.map(p => p.map(e => e.key).sort().join('+')).sort();

test('Ghép trận: ưu tiên Elo gần nhất, người chờ lâu được xét trước', () => {
  const m = mk();
  m.add(E(1, 'a', 1200)); m.adv(100);
  m.add(E(2, 'b', 1290)); m.adv(100);
  m.add(E(3, 'c', 1210)); m.adv(100);
  // a (chờ lâu nhất) chọn c (chênh 10) thay vì b (chênh 90)
  assert.deepEqual(ids(m.tick()), ['1+3']);
  assert.equal(m.size, 1); assert.ok(m.has(2));
  // bằng điểm: chọn người chờ lâu hơn
  const n = mk();
  n.add(E(1, 'a', 1500)); n.adv(10); n.add(E(2, 'b', 1450)); n.adv(10); n.add(E(3, 'c', 1550));
  assert.deepEqual(ids(n.tick()), ['1+2']);
  // 4 người: hai cặp gần nhau nhất
  const q = mk();
  [[1, 1000], [2, 1600], [3, 1050], [4, 1640]].forEach(([k, r]) => { q.add(E(k, 'u' + k, r)); q.adv(1); });
  assert.deepEqual(ids(q.tick()), ['1+3', '2+4']); assert.equal(q.size, 0);
});

test('Ghép trận: phạm vi nới rộng theo thời gian chờ', () => {
  const m = mk();
  m.add(E(1, 'a', 1200)); m.add(E(2, 'b', 1420)); // chênh 220
  assert.deepEqual(m.tick(), []);
  m.adv(14999); assert.deepEqual(m.tick(), [], '14,9 giây: ±200 vẫn chưa đủ');
  m.adv(1); assert.deepEqual(ids(m.tick()), ['1+2'], '15 giây: ±250');
  // chênh lệch rất lớn: chỉ ghép sau ~60 giây
  const n = mk();
  n.add(E(1, 'a', 800)); n.add(E(2, 'b', 2400));
  n.adv(59999); assert.deepEqual(n.tick(), []);
  n.adv(1); assert.deepEqual(ids(n.tick()), ['1+2']);
  // người mới vào được ghép với người đã chờ lâu (phạm vi của người chờ lâu hơn)
  const p = mk();
  p.add(E(1, 'a', 1200)); p.adv(30000); // ±400
  p.add(E(2, 'b', 1590)); assert.deepEqual(ids(p.tick()), ['1+2']);
  // đổi kiểu cờ thì tính lại thời gian chờ; cùng kiểu cờ thì giữ
  const s = mk();
  s.add(E(1, 'a', 1200)); s.adv(20000); s.add(E(1, 'a', 1200)); assert.equal(s.waitMs(s.get(1)), 20000);
  s.add(E(1, 'a', 1200, 'jieqi')); assert.equal(s.waitMs(s.get(1)), 0);
});

test('Ghép trận: không tự ghép với chính mình, tách kiểu cờ, rời hàng đợi', () => {
  const m = mk();
  m.add(E(1, 'same', 1200)); m.add(E(2, 'same', 1200)); m.adv(120000);
  assert.deepEqual(m.tick(), [], 'cùng tài khoản ở 2 thẻ không bao giờ được ghép');
  m.add(E(3, 'x', 1200, 'jieqi')); assert.deepEqual(m.tick(), [], 'khác kiểu cờ');
  m.add(E(4, 'y', 1300, 'jieqi')); assert.deepEqual(ids(m.tick()), ['3+4']);
  m.add(E(5, 'z', 1200));
  const pairs = m.tick(); assert.equal(pairs.length, 1);
  assert.ok(pairs[0].some(e => e.key === 5) && pairs[0].some(e => e.uid === 'same'));
  assert.equal(m.size, 1, 'thẻ còn lại của "same" vẫn chờ');
  assert.deepEqual(m.removeUser('same').map(e => e.key).length, 1); assert.equal(m.size, 0);
  m.add(E(6, 'k', 1200)); assert.ok(m.remove(6)); assert.ok(!m.remove(6)); assert.equal(m.size, 0);
  assert.throws(() => m.add({ key: 9, variant: 'standard' }), /thiếu/);
});
