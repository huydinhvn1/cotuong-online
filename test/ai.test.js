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

// ---- Luật: máy không được chiếu lặp (chiếu dai) quá 5 lần ----
const mv = (m) => (m.from << 7) | m.to;
const afterKey = (fen, from, to) => { const g = new X.Game(fen); g.move(from, to); return g.positions[1]; };
// Lịch sử giả: n nước chiếu liên tiếp của đỏ (xen nước đen), nước đỏ thứ i dẫn tới thế pos(i)
const run = (n, pos) => { const h = []; for (let i = 0; i < n; i++) { h.push({ side: 'r', check: true, pos: pos(i) }); h.push({ side: 'b', check: false, pos: 'b' + i }); } return h; };
const seeded = (fn) => { const r = Math.random; let s = 4242; Math.random = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); try { return fn(); } finally { Math.random = r; } };

test('Đếm số lần lặp thế cờ trong chuỗi chiếu liên tiếp', () => {
  assert.equal(AI.MAX_CHECK_REPEATS, 5);
  assert.deepEqual(AI.checkRunPositions([], 'r'), {});
  assert.deepEqual(AI.checkRunPositions(run(6, i => i % 2 ? 'P' : 'Q'), 'r'), { P: 3, Q: 3 });
  // một nước không chiếu của đỏ làm đứt chuỗi -> chỉ đếm phần sau
  const h = run(4, () => 'P').concat([{ side: 'r', check: false, pos: 'x' }, { side: 'b', check: false, pos: 'y' }], run(2, () => 'P'));
  assert.deepEqual(AI.checkRunPositions(h, 'r'), { P: 2 });
  // nước chiếu của bên kia không tính
  assert.deepEqual(AI.checkRunPositions(run(3, () => 'P'), 'b'), {});
});

test('Chiếu không lặp: không giới hạn số lần', () => {
  const fen = '3k5/R8/9/9/9/9/9/9/9/4K3R w';
  const r = AI.bestMove(fen, 3, { history: run(30, i => 'khác-' + i) }); // 30 lần chiếu liên tiếp, mỗi lần một thế khác
  assert.equal(r.avoidedCheck, false);
  const g = new X.Game(fen); g.move(r.from, r.to);
  assert.equal(g.status().reason, 'checkmate');
});

test('Chiếu lặp: thế cờ đã lặp 5 lần trong chuỗi chiếu thì không chiếu tạo lại lần thứ 6', () => {
  // Xe đỏ chiếu dai xe đen: máy cấp 3 (không có luật) sẽ chiếu lặp mãi
  const fen = '8R/3k5/9/9/9/9/9/9/2r6/4K4 w';
  const b = X.parseFen(fen).board;
  const free = seeded(() => AI.bestMove(fen, 3));
  assert.ok(AI.givesCheck(b.slice(), mv(free), 'r'), 'nước tốt nhất bình thường là nước chiếu');
  const key = afterKey(fen, free.from, free.to);
  // đã lặp 4 lần -> vẫn được chiếu tạo lại thế đó (lần thứ 5)
  const r4 = seeded(() => AI.bestMove(fen, 3, { history: run(4, () => key) }));
  assert.equal(r4.avoidedCheck, false);
  // đã lặp 5 lần -> cấm nước đó; nước khác (kể cả chiếu sang thế khác) vẫn được
  const r5 = seeded(() => AI.bestMove(fen, 3, { history: run(5, () => key) }));
  assert.equal(r5.avoidedCheck, true);
  assert.ok(new X.Game(fen).isLegal(r5.from, r5.to));
  assert.notEqual(afterKey(fen, r5.from, r5.to), key);
  // chuỗi bị đứt bởi một nước không chiếu -> đếm lại
  const h = run(5, () => key).concat([{ side: 'r', check: false, pos: 'x' }, { side: 'b', check: false, pos: 'y' }]);
  assert.equal(seeded(() => AI.bestMove(fen, 3, { history: h })).avoidedCheck, false);
});

test('Chiếu bí luôn được đi, kể cả khi thế đó đã lặp 5 lần', () => {
  const fen = '3k5/R8/9/9/9/9/9/9/9/4K3R w';
  const best = AI.bestMove(fen, 3), key = afterKey(fen, best.from, best.to);
  const r = AI.bestMove(fen, 3, { history: run(8, () => key) });
  const g = new X.Game(fen); g.move(r.from, r.to);
  assert.equal(g.status().reason, 'checkmate');
  assert.equal(r.avoidedCheck, false);
});

test('Nếu mọi nước hợp lệ đều bị cấm thì máy vẫn đi', () => {
  // Mã đỏ (0,8) chỉ còn đúng 1 nước (1,6) và nước đó chiếu (không bí); tướng đỏ bị khoá
  const fen = '4k3N/8b/9/9/9/9/9/9/8r/3K5 w';
  const b = X.parseFen(fen).board, all = X.legalMovesRaw(b.slice(), 'r');
  assert.equal(all.length, 1);
  const key = afterKey(fen, X.sq(0, 8), X.sq(1, 6));
  assert.ok(AI.isForbiddenRepeatCheck(b.slice(), all[0], 'r', { [key]: 5 }), 'nước duy nhất bị cấm');
  const r = AI.bestMove(fen, 3, { history: run(6, () => key) });
  assert.deepEqual([r.from, r.to], [X.sq(0, 8), X.sq(1, 6)]);
});

test('Máy tự đánh với máy (bỏ qua luật hoà 3 lần lặp): có luật thì không thế chiếu nào lặp quá 5 lần', () => {
  const fen = '8R/3k5/9/9/9/9/9/9/2r6/4K4 w';
  const H = g => g.history.map((r, j) => ({ side: r.side, check: !!r.check, pos: g.positions[j + 1] }));
  const play = (useRule) => seeded(() => {
    const g = new X.Game(fen); let maxRep = 0, checks = 0, avoided = 0;
    for (let i = 0; i < 60; i++) {
      const st = g.status(); if (st.over && st.reason !== 'repetition') break;
      const side = g.turn, r = AI.bestMove(g.fen(), 3, useRule ? { history: H(g) } : {});
      if (r.avoidedCheck) avoided++;
      const rec = g.move(r.from, r.to); assert.ok(rec);
      if (side === 'r') { if (rec.check) checks++; maxRep = Math.max(maxRep, 0, ...Object.values(AI.checkRunPositions(H(g), 'r'))); }
    }
    return { maxRep, checks, avoided };
  });
  const ctrl = play(false), withRule = play(true);
  assert.ok(ctrl.maxRep > 5, 'đối chứng chiếu lặp ' + ctrl.maxRep + ' lần');
  assert.ok(withRule.maxRep <= 5, 'có luật: lặp ' + withRule.maxRep + ' lần');
  assert.ok(withRule.avoided >= 1);
  assert.ok(withRule.checks > 5, 'vẫn được chiếu nhiều lần (' + withRule.checks + ')');
});
