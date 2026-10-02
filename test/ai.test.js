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
