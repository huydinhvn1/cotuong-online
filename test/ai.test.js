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

// ---- Luật: máy không được chiếu liên tục quá 5 lần ----
const H = (pattern) => pattern.split('').map((ch, i) => ({ side: i % 2 ? 'b' : 'r', check: ch === '+' }));

test('Đếm số nước chiếu liên tiếp của một bên', () => {
  assert.equal(AI.MAX_CONSECUTIVE_CHECKS, 5);
  assert.equal(AI.consecutiveChecks([], 'b'), 0);
  // r b r b ...: đen chiếu ở các nước lẻ, nước của đỏ xen giữa không làm đứt chuỗi
  assert.equal(AI.consecutiveChecks(H('.+.+.+.+.+'), 'b'), 5);
  assert.equal(AI.consecutiveChecks(H('.+.+.+.+.+'), 'r'), 0);
  // một nước không chiếu của đen làm đứt chuỗi (reset)
  assert.equal(AI.consecutiveChecks(H('.+.+...+.+'), 'b'), 2);
  assert.equal(AI.consecutiveChecks(H('.+.+.+.+..'), 'b'), 0);
  // đỏ chiếu cũng không tính cho đen
  assert.equal(AI.consecutiveChecks(H('++++++'), 'r'), 3);
});

test('Sau 5 lần chiếu liên tiếp, máy bỏ nước chiếu (kể cả nước chiếu bí) nếu còn nước khác', () => {
  const fen = '3k5/R8/9/9/9/9/9/9/9/4K3R w'; // đỏ có nước chiếu bí 1 nước
  const b = X.parseFen(fen).board;
  // đỏ đã chiếu 4 lần liên tiếp -> vẫn được chiếu (lần thứ 5)
  const r4 = AI.bestMove(fen, 3, { history: H('+.+.+.+.') });
  assert.ok(AI.givesCheck(b.slice(), (r4.from << 7) | r4.to, 'r'), 'lần thứ 5 vẫn chiếu');
  assert.equal(r4.avoidedCheck, false);
  // đã chiếu 5 lần liên tiếp -> nước kế tiếp không được chiếu
  for (const lvl of [1, 2, 3, 4]) {
    const r5 = AI.bestMove(fen, lvl, { history: H('+.+.+.+.+.') });
    const g = new X.Game(fen);
    assert.ok(g.isLegal(r5.from, r5.to), 'hợp lệ cấp ' + lvl);
    assert.equal(AI.givesCheck(b.slice(), (r5.from << 7) | r5.to, 'r'), false, 'không chiếu ở cấp ' + lvl);
    assert.equal(r5.avoidedCheck, true);
  }
  // một nước không chiếu ở giữa -> đếm lại từ đầu, được chiếu tiếp
  const rr = AI.bestMove(fen, 3, { history: H('+.+.+...+.+.') });
  assert.equal(rr.avoidedCheck, false);
  assert.ok(AI.givesCheck(b.slice(), (rr.from << 7) | rr.to, 'r'));
});

test('Nếu mọi nước hợp lệ đều là nước chiếu thì máy vẫn được chiếu', () => {
  // Mã đỏ (0,8) chỉ còn đúng 1 nước (1,6) và nước đó chiếu tướng; tướng đỏ bị khoá
  const fen = '4k3N/8b/9/9/9/9/9/9/8r/3K5 w';
  const b = X.parseFen(fen).board;
  const all = X.legalMovesRaw(b.slice(), 'r');
  assert.ok(all.length >= 1 && all.every(m => AI.givesCheck(b.slice(), m, 'r')));
  const r = AI.bestMove(fen, 3, { history: H('+.+.+.+.+.+.+.') });
  assert.ok(r, 'vẫn trả về nước đi');
  assert.deepEqual([r.from, r.to], [X.sq(0, 8), X.sq(1, 6)]);
  assert.equal(r.avoidedCheck, false);
});

test('Máy tự đánh với máy: thế cờ chiếu dai – có luật thì không quá 5 lần liên tiếp', () => {
  // Thế cờ mà máy (cấp 2) không có luật sẽ chiếu dai 6–12 lần liên tiếp
  const fen = '4k1r2/9/9/1N4c2/4b4/9/9/3p5/5K3/4R4 w';
  const play = (useHist) => {
    const g = new X.Game(fen), hist = []; let run = 0, maxRun = 0, avoided = 0;
    for (let i = 0; i < 40 && !g.status().over; i++) {
      const side = g.turn, r = AI.bestMove(g.fen(), 2, useHist ? { history: hist } : {});
      if (r.avoidedCheck) avoided++;
      const rec = g.move(r.from, r.to); assert.ok(rec, 'nước ' + i);
      hist.push({ side, check: !!rec.check });
      if (side === 'r') { run = rec.check ? run + 1 : 0; maxRun = Math.max(maxRun, run); }
    }
    return { maxRun, avoided };
  };
  // cố định "nhiễu" ngẫu nhiên của cấp 2 để kiểm thử ổn định
  const rand = Math.random; let seed = 12345;
  Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  try {
    let ctrl = 0, avoided = 0;
    for (let k = 0; k < 4; k++) {
      const a = play(true);
      assert.ok(a.maxRun <= 5, 'có luật: chuỗi chiếu ' + a.maxRun);
      avoided += a.avoided;
      ctrl = Math.max(ctrl, play(false).maxRun);
    }
    assert.ok(avoided >= 1, 'luật đã được áp dụng');
    assert.ok(ctrl > 5, 'đối chứng (không truyền lịch sử) chiếu dai ' + ctrl + ' lần');
  } finally { Math.random = rand; }
});
