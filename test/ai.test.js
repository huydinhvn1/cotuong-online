const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../shared/xiangqi');
const AI = require('../shared/ai');

test('AI tìm ra nước chiếu bí 1 nước', () => {
  const r = AI.bestMove('3k5/R8/9/9/9/9/9/9/9/4K3R w', 3);
  const g = new X.Game('3k5/R8/9/9/9/9/9/9/9/4K3R w');
  g.move(r.from, r.to);
  assert.equal(g.status().reason, 'checkmate');
});

test('AI ăn xe bị treo', () => {
  // Xe đen ở (5,4) không được bảo vệ, pháo đỏ (7,4) có ngòi tốt (6,4)? -> dùng xe đỏ (5,0) ăn ngang
  const fen = '3k5/9/9/9/9/R3r4/9/9/9/5K3 w';
  const r = AI.bestMove(fen, 2);
  assert.deepEqual([r.from, r.to], [X.sq(5, 0), X.sq(5, 4)]);
});

test('Mọi cấp độ AI đều trả về nước hợp lệ từ thế ban đầu', () => {
  for (const lvl of [1, 2, 3, 4]) {
    const r = AI.bestMove(X.INITIAL_FEN, lvl);
    const g = new X.Game();
    assert.ok(g.isLegal(r.from, r.to), 'cấp ' + lvl);
  }
});

test('AI tự đánh với AI 40 nước không sinh nước sai', () => {
  const g = new X.Game();
  for (let i = 0; i < 40 && !g.status().over; i++) {
    const r = AI.bestMove(g.fen(), 2);
    assert.ok(g.move(r.from, r.to), 'nước ' + i);
  }
});

// ---- Luật cấm chiếu dai (trong xiangqi.js): máy không bao giờ chọn nước chiếu dai bị cấm ----
const PERP_PREFIX = [[70, 34], [25, 88], [34, 31], [19, 37], [64, 67], [88, 86]];
const PERP_CYCLE = [[31, 30], [2, 22], [30, 31], [22, 2]];
const seeded = (fn) => { const r = Math.random; let s = 4242; Math.random = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); try { return fn(); } finally { Math.random = r; } };

test('Máy được chiếu nhiều lần nếu không lặp thế cờ', () => {
  const fen = '3k5/R8/9/9/9/9/9/9/9/4K3R w';
  const hist = []; for (let i = 0; i < 30; i++) { hist.push({ side: 'r', check: true, pos: 'khác-' + i }); hist.push({ side: 'b', check: false, pos: 'b' + i }); }
  const r = AI.bestMove(fen, 3, { history: hist });
  assert.equal(r.avoidedCheck, false);
  const g = new X.Game(fen); g.move(r.from, r.to);
  assert.equal(g.status().reason, 'checkmate');
});

test('Máy không chọn nước chiếu dai bị cấm (mọi cấp độ)', () => {
  const g = new X.Game();
  for (const [f, t] of PERP_PREFIX) g.move(f, t);
  for (let i = 0; i < 8; i++) g.move(...PERP_CYCLE[i % 4]);
  assert.equal(g.moveError(...PERP_CYCLE[0]), 'perpetual');
  for (const lvl of [1, 2, 3, 4]) {
    const r = AI.bestMove(g.fen(), lvl, { history: g.entries() });
    assert.equal(g.moveError(r.from, r.to), null, 'cấp ' + lvl + ' chọn nước hợp lệ');
    assert.notDeepEqual([r.from, r.to], PERP_CYCLE[0]);
  }
});

test('Mọi nước đều là chiếu dai bị cấm -> máy không trả nước (ván kết thúc: bên chiếu dai thua)', () => {
  const fen = '4k3N/8b/9/9/9/9/9/9/8r/3K5 w';
  const g1 = new X.Game(fen); g1.move(X.sq(0, 8), X.sq(1, 6)); const key = g1.positions[1];
  const hist = [{ side: 'r', check: true, pos: key }, { side: 'b', check: false, pos: 'x' }, { side: 'r', check: true, pos: key }, { side: 'b', check: false, pos: 'y' }];
  assert.equal(AI.bestMove(fen, 3, { history: hist }), null);
  assert.ok(AI.bestMove(fen, 3, { history: hist.slice(2) }), 'mới lặp 1 lần thì vẫn đi');
});

test('Máy tự đánh với máy trong thế chiếu dai: không thế chiếu nào lặp lần 3, mọi nước đều hợp lệ', () => {
  const fen = '8R/3k5/9/9/9/9/9/9/2r6/4K4 w'; // không có luật, máy cấp 3 sẽ chiếu dai mãi
  seeded(() => {
    const g = new X.Game(fen); let checks = 0, avoided = 0;
    for (let i = 0; i < 60 && !g.status().over; i++) {
      const side = g.turn, r = AI.bestMove(g.fen(), 3, { history: g.entries() });
      if (r.avoidedCheck) avoided++;
      assert.equal(g.moveError(r.from, r.to), null, 'nước ' + i);
      const rec = g.move(r.from, r.to); assert.ok(rec);
      if (side === 'r' && rec.check) checks++;
      const counts = X.checkRunCounts(g.entries(), side) || {};
      assert.ok(Object.values(counts).every(c => c < 3), 'không lặp lần 3 (nước ' + i + ')');
    }
    assert.ok(avoided >= 1, 'luật đã phải can thiệp');
    assert.ok(checks > 5, 'vẫn chiếu nhiều lần (' + checks + ')');
  });
});
