// AI cờ úp: chỉ dùng thông tin công khai, mọi cấp độ đi nước hợp lệ
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../shared/xiangqi');
const AI = require('../shared/ai');
const { sq } = X;
function seqRand(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }

// gọi máy giống như giao diện: chỉ FEN công khai + lịch sử + bộ quân còn úp (công khai)
function aiMove(g, level, timeMs) {
  const cfg = Object.assign({}, AI.LEVELS[level], timeMs ? { timeMs } : {});
  const s = X.parseFen(g.fen());
  const counts = X.checkRunCounts(g.entries(), g.turn);
  return new AI.Searcher(cfg).search(s.board, s.turn, { pool: g.hiddenPool(), forbid: counts ? (b, m, sd) => X.isPerpetualMove(b, m, sd, counts) : null });
}

test('Máy chỉ nhận FEN công khai: hai ván khác mặt quân nhưng cùng thông tin công khai -> cùng nước đi', () => {
  // dựng 2 ván cùng các nước đi & cùng mặt quân đã lật, khác mặt các quân còn úp
  const want = { [sq(7, 1)]: 'C', [sq(0, 7)]: 'n' };
  const mk = seed => {
    const rand = seqRand(seed);
    const left = { r: 'AABBNNRRPPPPPC'.split(''), b: 'aabbnrrccppppp'.split('') };
    for (const s of ['r', 'b']) for (let i = left[s].length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [left[s][i], left[s][j]] = [left[s][j], left[s][i]]; }
    const d = X.JIEQI_SQUARES.map(q => want[q] || left[X.homeType(q, 'r') ? 'r' : 'b'].shift()).join('');
    const g = X.createGame('jieqi', d);
    g.move(sq(7, 1), sq(7, 4)); g.move(sq(0, 7), sq(2, 6));
    return g;
  };
  const g1 = mk(1), g2 = mk(99);
  assert.notEqual(g1.deal(), g2.deal());
  assert.equal(g1.fen(), g2.fen());
  assert.deepEqual(g1.hiddenPool(), g2.hiddenPool());
  const cfg = { depth: 3, timeMs: 60000, noise: 0 };
  const run = g => { const s = X.parseFen(g.fen()); return new AI.Searcher(cfg).search(s.board, s.turn, { pool: g.hiddenPool() }); };
  const a = run(g1), b = run(g2);
  assert.deepEqual([a.from, a.to, a.score], [b.from, b.to, b.score]);
});

test('Giá trị kỳ vọng quân úp theo bộ quân còn lại', () => {
  assert.equal(AI.expectedValue({ a: 2, b: 2, n: 2, r: 2, c: 2, p: 5 }), Math.round(5000 / 15));
  assert.equal(AI.expectedValue({ a: 0, b: 0, n: 0, r: 1, c: 0, p: 0 }), 900);
  assert.ok(AI.expectedValue({ a: 0, b: 0, n: 0, r: 0, c: 0, p: 3 }) === 100);
});

test('Cờ úp: máy chiếu bí 1 nước bằng Xe đã lật và ăn Xe treo thay vì quân úp', () => {
  const mate = AI.bestMove('3k5/R8/9/9/9/9/9/9/9/4K3R w jq', 3, { pool: { r: {}, b: {} } });
  const g = new X.Game('3k5/R8/9/9/9/9/9/9/9/4K3R w jq'); g.move(mate.from, mate.to);
  assert.equal(g.status().reason, 'checkmate');
  // Xe đỏ (5,0) có thể ăn Xe đen (5,4) hoặc quân úp đen (3,0) (giá trị kỳ vọng ~ thấp hơn Xe)
  const fen = '4k4/9/9/x8/9/R3r4/9/9/9/5K3 w jq';
  const r = AI.bestMove(fen, 2, { pool: { r: { a: 2, b: 2, n: 2, r: 1, c: 2, p: 5 }, b: { a: 2, b: 2, n: 2, r: 1, c: 2, p: 4 } } });
  assert.deepEqual([r.from, r.to], [sq(5, 0), sq(5, 4)]);
});

test('Mọi cấp độ máy đi nước hợp lệ trong cờ úp (máy vs máy)', () => {
  for (let level = 1; level <= 5; level++) {
    const rand = seqRand(level * 31);
    const g = X.createGame('jieqi', X.randomDeal(rand));
    for (let ply = 0; ply < 24 && !g.status().over; ply++) {
      const lvl = g.turn === 'r' ? level : Math.max(1, level - 1);
      const r = aiMove(g, lvl, 150);
      assert.ok(r, 'có nước');
      assert.ok(g.moves().some(m => m.from === r.from && m.to === r.to), `cấp ${lvl}: nước ${r.from}->${r.to} hợp lệ`);
      assert.ok(g.move(r.from, r.to));
    }
  }
});

test('Máy mạnh hơn thắng máy yếu trong cờ úp (Vừa vs Tập chơi)', () => {
  let score = 0;
  for (let k = 0; k < 4; k++) {
    const g = X.createGame('jieqi', X.randomDeal(seqRand(500 + k)));
    const strong = k % 2 ? 'b' : 'r';
    for (let ply = 0; ply < 200 && !g.status().over; ply++) {
      const r = aiMove(g, g.turn === strong ? 3 : 1, 120);
      g.move(r.from, r.to);
    }
    const st = g.status();
    score += st.winner === strong ? 1 : st.winner ? -1 : 0;
  }
  assert.ok(score >= 2, 'điểm ' + score);
});
