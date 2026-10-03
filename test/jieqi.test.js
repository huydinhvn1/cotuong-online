// Cờ úp (jieqi): luật đi quân úp, lật quân, Sĩ/Tượng đã lật đi khắp bàn, chiếu, chiếu dai, bí mật mặt quân
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../shared/xiangqi');
const { Game, sq } = X;

// Bộ xáo cố định để kiểm thử: Đỏ theo thứ tự JIEQI_SQUARES[0..14], Đen [15..29]
function seqRand(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }
const dealWith = (red, black) => {
  assert.ok(X.validDeal(red + black), 'deal hợp lệ ' + red + black);
  return red + black;
};
// sắp quân thật theo ý muốn: map ô -> quân (các ô còn lại lấp bằng quân còn thừa)
function customDeal(want) {
  const left = { r: 'AABBNNRRCCPPPPP'.split(''), b: 'aabbnnrrccppppp'.split('') };
  const out = X.JIEQI_SQUARES.map(s => want[s] || null);
  out.forEach(p => { if (p) { const side = p < 'a' ? 'r' : 'b'; left[side].splice(left[side].indexOf(p), 1); } });
  X.JIEQI_SQUARES.forEach((s, i) => { if (!out[i]) out[i] = left[X.homeType(s, 'r') ? 'r' : 'b'].shift(); });
  return dealWith(out.slice(0, 15).join(''), out.slice(15).join(''));
}

test('Thế ban đầu cờ úp: Tướng ngửa, 15 quân mỗi bên úp, FEN công khai không lộ mặt quân', () => {
  const deal = X.randomDeal(seqRand(7));
  const g = X.createGame('jieqi', deal);
  assert.equal(g.variant, 'jieqi');
  assert.equal(g.fen(), 'xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w jq');
  assert.equal(g.board[sq(9, 4)], 'K'); assert.equal(g.board[sq(0, 4)], 'k');
  assert.equal(g.board.filter(p => p === 'X').length, 15);
  assert.equal(g.board.filter(p => p === 'x').length, 15);
  // quân úp đi như quân vốn đứng ở ô đó -> số nước giống cờ tướng (44)
  assert.equal(g.moves().length, 44);
  // mặt thật không nằm trong JSON / FEN
  assert.ok(!JSON.stringify(g).includes(deal));
  assert.equal(Object.keys(g).includes('secret'), false);
  assert.equal(g.deal(), deal);
});

test('Xáo bài: đủ 15 quân mỗi bên, ngẫu nhiên, chuỗi sai bị từ chối', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) { const d = X.randomDeal(); assert.ok(X.validDeal(d)); seen.add(d); }
  assert.ok(seen.size > 45, 'các ván khác nhau');
  assert.equal(X.validDeal('AABBNNRRCCPPPPPaabbnnrrccpppp'), false);
  assert.equal(X.validDeal('AABBNNRRCCPPPPRaabbnnrrccppppp'), false);
  assert.throws(() => X.createGame('jieqi', 'xyz'));
});

test('Quân úp đi theo ô xuất phát rồi lật ra mặt thật', () => {
  // ô Pháo (7,1) thật ra là Xe; ô Tốt (6,0) thật ra là Sĩ; ô Sĩ (9,3) thật ra là Pháo
  const deal = customDeal({ [sq(7, 1)]: 'R', [sq(6, 0)]: 'A', [sq(9, 3)]: 'C' });
  const g = X.createGame('jieqi', deal);
  // ô Pháo: đi như Pháo (dọc cột 1 tới hàng 3, ngang hàng 7; ăn ô (0,1) qua ngòi (2,1))
  const t = g.movesFrom(sq(7, 1)).sort((a, b) => a - b);
  assert.ok(t.includes(sq(0, 1)), 'pháo úp ăn được qua ngòi');
  assert.ok(t.includes(sq(7, 4)) && t.includes(sq(3, 1)));
  assert.ok(!t.includes(sq(2, 1)), 'không ăn quân sát mặt như Xe');
  // ô Sĩ (9,3): chỉ đi chéo vào cung (8,4)
  assert.deepEqual(g.movesFrom(sq(9, 3)), [sq(8, 4)]);
  // ô Tốt: chỉ tiến 1 ô
  assert.deepEqual(g.movesFrom(sq(6, 0)), [sq(5, 0)]);
  const rec = g.move(sq(7, 1), sq(7, 4));
  assert.equal(rec.reveal, 'R');
  assert.equal(rec.notation, 'P8-5(X)');
  assert.equal(g.board[sq(7, 4)], 'R', 'đã lật: là Xe');
  g.move(sq(3, 0), sq(4, 0)); // Đen: tốt úp
  // giờ đi như Xe thật
  assert.ok(g.movesFrom(sq(7, 4)).includes(sq(7, 6)) && g.movesFrom(sq(7, 4)).includes(sq(8, 4)), 'đi ngang/dọc như Xe');
  // hoàn tác: quân lại úp ở chỗ cũ
  g.undo(); g.undo();
  assert.equal(g.board[sq(7, 1)], 'X'); assert.equal(g.board[sq(7, 4)], '');
});

test('Sĩ, Tượng đã lật đi khắp bàn (qua sông, ra khỏi cung); Tượng vẫn bị cản mắt', () => {
  const g = new Game('4k4/9/9/9/2b6/9/9/5A3/9/3K5 w jq');
  // Sĩ ở (7,5) ngoài cung -> đi chéo 1 ô ra mọi hướng
  assert.deepEqual(g.movesFrom(sq(7, 5)).sort((a, b) => a - b), [sq(6, 4), sq(6, 6), sq(8, 4), sq(8, 6)].sort((a, b) => a - b));
  // cùng thế cờ nhưng cờ tướng thường: Sĩ chỉ đi trong cung
  assert.deepEqual(new Game('4k4/9/9/9/2b6/9/9/5A3/9/3K5 w').movesFrom(sq(7, 5)), [sq(8, 4)]);
  const g2 = new Game('4k4/9/9/9/2b6/9/9/5A3/9/3K5 b jq');
  // Tượng đen (4,2) qua sông được
  const t = g2.movesFrom(sq(4, 2));
  assert.ok(t.includes(sq(6, 0)) && t.includes(sq(6, 4)), 'qua sông');
  // cản mắt
  const g3 = new Game('4k4/9/9/9/2b6/1P7/9/5A3/9/3K5 b jq');
  assert.ok(!g3.movesFrom(sq(4, 2)).includes(sq(6, 0)), 'bị cản mắt tại (5,1)');
});

test('Sĩ/Tượng đã lật chiếu được tướng; lộ mặt tướng vẫn áp dụng', () => {
  // Sĩ đỏ (1,3) chéo sát tướng đen (0,4)
  assert.equal(X.inCheck(X.parseFen('4k4/3A5/9/9/9/9/9/9/9/3K5 b jq').board, 'b'), true);
  // Tượng đỏ (2,2) -> (0,4) mắt (1,3) trống
  assert.equal(X.inCheck(X.parseFen('4k4/9/2B6/9/9/9/9/9/9/3K5 b jq').board, 'b'), true);
  assert.equal(X.inCheck(X.parseFen('4k4/3p5/2B6/9/9/9/9/9/9/3K5 b jq').board, 'b'), false, 'mắt tượng bị chặn');
  // tướng đối mặt
  const g = new Game('4k4/9/9/9/9/9/9/9/9/3K5 w jq');
  assert.ok(!g.movesFrom(sq(9, 3)).includes(sq(9, 4)), 'không được lộ mặt tướng');
  // nước tạo chiếu bằng Sĩ đã lật được đánh dấu check
  const g2 = new Game('4k4/9/2A6/9/9/9/9/9/9/3K5 w jq');
  const rec = g2.move(sq(2, 2), sq(1, 3));
  assert.equal(rec.check, true);
});

test('Quân úp chiếu theo loại quân của ô xuất phát (cấm tự đi vào thế bị chiếu)', () => {
  // Xe úp đỏ ở ô Xe (9,0); tướng đen không được ra cột 0 – tướng không ra ngoài cung, kiểm tra trực tiếp isAttacked
  const b = X.parseFen('4k4/9/9/9/9/9/9/9/9/X3K4 b jq').board;
  assert.equal(X.isAttacked(b, sq(3, 0), 'b'), true, 'ô Xe úp tấn công dọc cột');
  assert.equal(X.isAttacked(b, sq(9, 2), 'b'), true, 'và ngang hàng');
  const b2 = X.parseFen('4k4/9/9/9/9/9/9/1X7/9/4K4 b jq').board; // úp ở ô Pháo (7,1): đi như Pháo, không ăn trực tiếp
  assert.equal(X.isAttacked(b2, sq(3, 1), 'b'), false);
});

test('Ăn quân úp: quân bị ăn lộ mặt; bộ quân còn úp tính từ thông tin công khai', () => {
  const deal = customDeal({ [sq(0, 1)]: 'r', [sq(7, 1)]: 'N' });
  const g = X.createGame('jieqi', deal);
  const rec = g.move(sq(7, 1), sq(0, 1)); // Pháo úp ăn qua ngòi (2,1)
  assert.equal(rec.captured, 'x'); assert.equal(rec.capReal, 'r'); assert.equal(rec.reveal, 'N');
  const pool = g.hiddenPool();
  assert.deepEqual(pool.b, { a: 2, b: 2, n: 2, r: 1, c: 2, p: 5 });
  assert.deepEqual(pool.r, { a: 2, b: 2, n: 1, r: 2, c: 2, p: 5 });
  // ván công khai (client online) dựng lại từ thông tin server gửi -> cùng FEN, cùng bộ quân
  const pub = X.createGame('jieqi');
  assert.ok(pub.move(sq(7, 1), sq(0, 1), { reveal: 'N', cap: 'r' }));
  assert.equal(pub.fen(), g.fen());
  assert.deepEqual(pub.hiddenPool(), pool);
  // thông tin sai màu bị bỏ qua (quân vẫn úp)
  const pub2 = X.createGame('jieqi');
  pub2.move(sq(7, 1), sq(0, 1), { reveal: 'n', cap: 'R' });
  assert.equal(pub2.board[sq(0, 1)], 'X');
});

test('Không ai biết mặt quân úp, kể cả bên cầm quân: ván công khai không có secret', () => {
  const pub = X.createGame('jieqi');
  assert.equal(pub.secret, undefined);
  assert.equal(pub.deal(), null);
  const rec = pub.move(sq(6, 0), sq(5, 0));
  assert.equal(rec.reveal, undefined, 'chưa có mặt thật -> vẫn úp');
  assert.equal(pub.board[sq(5, 0)], 'X');
});

test('Cấm chiếu dai vẫn áp dụng trong cờ úp', () => {
  const PERP_PREFIX = [[70, 34], [25, 88], [34, 31], [19, 37], [64, 67], [88, 86]];
  const PERP_CYCLE = [[31, 30], [2, 22], [30, 31], [22, 2]];
  const g = new Game(X.INITIAL_FEN + ' jq'); // mọi quân đã ngửa, luật cờ úp
  for (const [f, t] of PERP_PREFIX) assert.ok(g.move(f, t));
  for (let i = 0; i < 8; i++) { const [f, t] = PERP_CYCLE[i % 4]; assert.ok(g.move(f, t), 'nước ' + i); }
  assert.equal(g.moveError(...PERP_CYCLE[0]), 'perpetual');
  assert.equal(g.status().over, false);
});

test('Hết quân tấn công trong cờ úp: Sĩ/Tượng vẫn còn sức tấn công', () => {
  assert.equal(new Game('4k4/9/9/9/9/9/9/9/4A4/3K5 w jq').status().over, false);
  assert.equal(new Game('4k4/9/9/9/9/9/9/9/4A4/3K5 w').status().reason, 'insufficient');
  assert.equal(new Game('3k5/9/9/9/9/9/9/9/9/4K4 w jq').status().reason, 'insufficient');
});

test('Ván cờ úp ngẫu nhiên: mọi nước hợp lệ, FEN công khai khớp ván dựng lại từ thông tin công khai', () => {
  for (let k = 0; k < 20; k++) {
    const rand = seqRand(100 + k);
    const g = X.createGame('jieqi', X.randomDeal(rand)), pub = X.createGame('jieqi');
    for (let i = 0; i < 120 && !g.status().over; i++) {
      const ms = g.moves(); const m = ms[Math.floor(rand() * ms.length)];
      const rec = g.move(m.from, m.to); assert.ok(rec);
      assert.ok(pub.move(m.from, m.to, { reveal: rec.reveal, cap: rec.capReal }));
      assert.equal(pub.fen(), g.fen());
      // số quân úp trên bàn = tổng bộ quân còn úp
      const pool = g.hiddenPool();
      for (const s of ['r', 'b']) {
        const onBoard = g.board.filter(p => p === (s === 'r' ? 'X' : 'x')).length;
        assert.equal(Object.values(pool[s]).reduce((a, b) => a + b, 0), onBoard);
      }
    }
  }
});
