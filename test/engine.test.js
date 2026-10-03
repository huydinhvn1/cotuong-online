const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../shared/xiangqi');
const { Game, sq } = X;

const dests = (g, r, c) => g.movesFrom(sq(r, c)).map(i => [Math.floor(i / 9), i % 9]).sort();
const set = a => a.map(x => x.join(',')).sort();

test('perft từ thế cờ ban đầu khớp số liệu chuẩn (44 / 1920 / 79666 / 3290240)', () => {
  const { board, turn } = X.parseFen(X.INITIAL_FEN);
  assert.equal(X.perft(board, turn, 1), 44);
  assert.equal(X.perft(board, turn, 2), 1920);
  assert.equal(X.perft(board, turn, 3), 79666);
  assert.equal(X.perft(board, turn, 4), 3290240);
});

test('FEN đọc/ghi hai chiều', () => {
  const g = new Game();
  assert.equal(g.fen(), X.INITIAL_FEN);
  g.move(sq(7, 7), sq(7, 4));
  assert.equal(g.fen(), 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C4/9/RNBAKABNR b');
});

test('Tướng và Sĩ chỉ đi trong cung', () => {
  const g = new Game('4k4/9/9/9/9/9/9/9/9/3AK4 w');
  assert.deepEqual(set(dests(g, 9, 3)), set([[8, 4]]));          // sĩ chỉ đi chéo vào tâm cung
  const g2 = new Game('5k3/9/9/9/9/9/9/9/9/3K5 w');
  assert.deepEqual(set(dests(g2, 9, 3)), set([[8, 3], [9, 4]])); // không ra (9,2)
});

test('Tượng không qua sông và bị cản mắt', () => {
  const g = new Game('3k5/9/9/9/9/2B6/9/9/9/4K4 w');
  assert.deepEqual(set(dests(g, 5, 2)), set([[7, 0], [7, 4]]));   // không sang (3,0),(3,4)
  const g2 = new Game('3k5/9/9/9/9/9/9/9/3P5/2B1K4 w');
  assert.deepEqual(set(dests(g2, 9, 2)), set([[7, 0]]));          // mắt (8,3) bị chặn
});

test('Mã bị cản chân', () => {
  const g = new Game();
  assert.deepEqual(set(dests(g, 9, 1)), set([[7, 0], [7, 2]]));
  const g2 = new Game('3k5/9/9/9/9/9/9/9/1P7/1N2K4 w');
  assert.deepEqual(set(dests(g2, 9, 1)), set([[8, 3]]));           // chân (8,1) bị chặn
  const g3 = new Game('4k4/9/9/9/4N4/9/9/9/9/3K5 w');
  assert.equal(dests(g3, 4, 4).length, 8);
});

test('Xe đi thẳng, ăn quân đầu tiên gặp', () => {
  const g = new Game('4k4/9/9/9/p8/9/9/9/9/R2K5 w');
  assert.deepEqual(set(dests(g, 9, 0)), set([[8, 0], [7, 0], [6, 0], [5, 0], [4, 0], [9, 1], [9, 2]]));
});

test('Pháo phải có ngòi mới ăn được quân', () => {
  const g = new Game();
  const d = set(dests(g, 7, 1));
  assert.ok(d.includes('0,1'), 'pháo ăn mã qua ngòi pháo đen');
  assert.ok(!d.includes('2,1'), 'không ăn trực tiếp khi không có ngòi');
  assert.ok(!d.includes('9,1'), 'không ăn quân mình');
});

test('Tốt chưa qua sông chỉ tiến; qua sông được đi ngang, không lùi', () => {
  const g = new Game();
  assert.deepEqual(set(dests(g, 6, 0)), set([[5, 0]]));
  const g2 = new Game('3k5/9/9/9/4P4/9/9/9/9/5K3 w');
  assert.deepEqual(set(dests(g2, 4, 4)), set([[3, 4], [4, 3], [4, 5]]));
  const g3 = new Game('3k5/9/9/9/9/4p4/9/9/9/5K3 b');
  assert.deepEqual(set(dests(g3, 5, 4)), set([[6, 4], [5, 3], [5, 5]]));
});

test('Luật lộ mặt tướng', () => {
  const g = new Game('4k4/9/9/9/9/4R4/9/9/9/4K4 w');
  assert.ok(!g.isLegal(sq(5, 4), sq(5, 0)), 'xe không được rời cột làm lộ mặt tướng');
  assert.ok(g.isLegal(sq(5, 4), sq(1, 4)));
  const g2 = new Game('4k4/9/9/9/9/9/9/9/9/3K5 w');
  assert.ok(!g2.isLegal(sq(9, 3), sq(9, 4)), 'tướng không được đối mặt tướng');
});

test('Không được đi vào ô bị chiếu', () => {
  const g = new Game('3rk4/9/9/9/9/9/9/9/4K4/9 w');
  const d = set(dests(g, 8, 4));
  assert.ok(!d.includes('8,3') && !d.includes('7,3') && !d.includes('9,3'));
});

test('Phát hiện chiếu', () => {
  const g = new Game('4k4/9/9/9/9/9/9/9/9/3KR4 b'); // xe đỏ (9,4) chiếu tướng đen theo cột 4
  assert.equal(g.inCheck(), true);
  const g2 = new Game('3k5/9/2N6/9/9/9/9/9/9/4K4 b'); // mã (2,2) chiếu tướng (0,3)
  assert.equal(g2.inCheck(), true);
  const g3 = new Game('3k5/2P6/2N6/9/9/9/9/9/9/4K4 b'); // chân mã bị chặn -> không chiếu
  assert.equal(g3.inCheck(), false);
  const g4 = new Game('3k5/9/9/3p5/9/9/3C5/9/9/4K4 b'); // pháo có ngòi -> chiếu
  assert.equal(g4.inCheck(), true);
  const g5 = new Game('3k5/3P5/9/9/9/9/9/9/9/4K4 b'); // tốt đỏ ngay dưới tướng -> chiếu
  assert.equal(g5.inCheck(), true);
});

test('Chiếu bí', () => {
  const g = new Game('3k4R/R8/9/9/9/9/9/9/9/4K4 b');
  const s = g.status();
  assert.deepEqual([s.over, s.winner, s.reason], [true, 'r', 'checkmate']);
});

test('Hết nước đi (bị vây) = thua', () => {
  const g = new Game('3k5/8R/9/9/9/9/9/9/9/4K4 b');
  const s = g.status();
  assert.deepEqual([s.over, s.winner, s.reason, s.check], [true, 'r', 'stalemate', false]);
});

test('Ký hiệu nước đi kiểu Việt Nam', () => {
  const g = new Game();
  assert.equal(g.move(sq(7, 7), sq(7, 4)).notation, 'P2-5');
  assert.equal(g.move(sq(0, 1), sq(2, 2)).notation, 'M2.3');
  assert.equal(g.move(sq(9, 7), sq(7, 6)).notation, 'M2.3');
  assert.equal(g.move(sq(0, 0), sq(1, 0)).notation, 'X1.1');
  assert.equal(g.move(sq(9, 8), sq(8, 8)).notation, 'X1.1');
  assert.equal(g.move(sq(1, 0), sq(1, 3)).notation, 'X1-4');
  assert.equal(g.move(sq(8, 8), sq(9, 8)).notation, 'X1/1');
  const t = new Game('3k5/9/9/9/9/9/R8/9/R8/4K4 w');
  assert.equal(t.move(sq(6, 0), sq(5, 0)).notation, 'Xt.1');
  t.move(sq(0, 3), sq(1, 3));
  assert.equal(t.move(sq(8, 0), sq(8, 1)).notation, 'Xs-8');
});

test('Nước đi sai bị từ chối, hoàn tác khôi phục thế cờ', () => {
  const g = new Game();
  assert.equal(g.move(sq(9, 0), sq(5, 0)), null);     // xe bị tốt chặn
  assert.equal(g.move(sq(0, 0), sq(1, 0)), null);     // chưa đến lượt đen
  g.move(sq(7, 1), sq(0, 1));                         // pháo ăn mã
  assert.equal(g.history[0].captured, 'n');
  g.undo();
  assert.equal(g.fen(), X.INITIAL_FEN);
});

test('Lặp lại thế cờ 3 lần = hoà (đơn giản hoá)', () => {
  const g = new Game();
  for (let i = 0; i < 2; i++) {
    g.move(sq(9, 1), sq(7, 2)); g.move(sq(0, 1), sq(2, 2));
    g.move(sq(7, 2), sq(9, 1)); g.move(sq(2, 2), sq(0, 1));
  }
  assert.equal(g.status().reason, 'repetition');
});

// ---- Luật cấm chiếu dai (chiếu lặp lại) ----
// Từ thế ban đầu: 6 nước dẫn tới thế Đỏ có thể chiếu dai bằng Pháo (Pt-6 / P6-5), Đen đỡ bằng Tượng
const PERP_PREFIX = [[70, 34], [25, 88], [34, 31], [19, 37], [64, 67], [88, 86]];
const PERP_CYCLE = [[31, 30], [2, 22], [30, 31], [22, 2]];
const perpGame = (cycles) => {
  const g = new Game();
  for (const [f, t] of PERP_PREFIX) assert.ok(g.move(f, t));
  for (let i = 0; i < cycles * 4; i++) { const [f, t] = PERP_CYCLE[i % 4]; assert.ok(g.move(f, t), 'nước chu kỳ ' + i); }
  return g;
};

test('Chiếu dai: nước chiếu tạo lại thế cờ lần thứ 3 bị cấm, kèm thông báo tiếng Việt', () => {
  assert.equal(X.PERPETUAL_MSG, 'Không được chiếu lặp lại – hãy đổi nước');
  const g = perpGame(2); // đã lặp 2 vòng: thế sau Pt-6 đã có 2 lần
  // thế đầu chu kỳ đã xuất hiện 3 lần nhưng do Đỏ chiếu liên tục -> không xử hoà
  assert.equal(g.status().over, false);
  const [f, t] = PERP_CYCLE[0];
  assert.equal(g.isPerpetual(f, t), true);
  assert.equal(g.moveError(f, t), 'perpetual');
  assert.equal(g.move(f, t), null, 'nước bị từ chối');
  assert.ok(!g.moves().some(m => m.from === f && m.to === t), 'không có trong danh sách nước hợp lệ');
  assert.ok(g.targetsFrom(f).includes(t), 'vẫn là ô đích theo luật đi quân (để giao diện báo lý do)');
  // nước khác (kể cả chiếu sang thế khác) vẫn được
  assert.ok(g.moves().length > 0);
  const other = g.moves().find(m => !(m.from === f && m.to === t));
  assert.equal(g.moveError(other.from, other.to), null);
  assert.ok(g.move(other.from, other.to));
});

test('Chiếu dai: lần lặp thứ 2 vẫn được; một nước không chiếu làm đứt chuỗi', () => {
  const g = perpGame(1);
  assert.equal(g.moveError(...PERP_CYCLE[0]), null, 'lần thứ 2 vẫn được');
  // chen một nước không chiếu của Đỏ rồi quay lại -> đếm lại từ đầu
  const g2 = perpGame(2);
  const quiet = g2.moves().find(m => { g2.move(m.from, m.to); const ok = !g2.history.at(-1).check; g2.undo(); return ok && g2.board[m.from] === 'P'; });
  assert.ok(quiet, 'có nước tốt không chiếu');
  g2.move(quiet.from, quiet.to);
  assert.equal(g2.status().over, false);
});

test('Lặp thế cờ không do chiếu dai vẫn xử hoà 3 lần', () => {
  const g = new Game();
  for (let i = 0; i < 2; i++) {
    g.move(sq(9, 1), sq(7, 2)); g.move(sq(0, 1), sq(2, 2));
    g.move(sq(7, 2), sq(9, 1)); g.move(sq(2, 2), sq(0, 1));
  }
  assert.equal(g.status().reason, 'repetition');
  assert.equal(g.status().winner, null);
});

test('Chiếu bí luôn được đi dù thế cờ đã lặp', () => {
  const fen = '3k5/R8/9/9/9/9/9/9/9/4K3R w';
  const b = X.parseFen(fen).board, m = X.encode(sq(9, 8), sq(0, 8)); // Xe 1 tiến 9 chiếu bí
  const after = (mv) => { const g = new Game(fen); g.move(X.mFrom(mv), X.mTo(mv)); return g; };
  assert.equal(after(m).status().reason, 'checkmate');
  const key = after(m).positions[1];
  assert.equal(X.isPerpetualMove(b, m, 'r', { [key]: 2 }), false, 'chiếu bí không bị cấm');
  // nước chiếu thường (không bí) với cùng điều kiện thì bị cấm
  const m2 = X.encode(sq(1, 0), sq(1, 3)), key2 = after(m2).positions[1];
  assert.equal(after(m2).status().over, false);
  assert.equal(X.isPerpetualMove(b, m2, 'r', { [key2]: 2 }), true);
});

test('Bên chiếu dai không còn nước nào khác -> thua (reason perpetual)', () => {
  // Mã đỏ (0,8) chỉ còn đúng 1 nước (1,6) và nước đó chiếu (không bí); tướng đỏ bị khoá
  const fen = '4k3N/8b/9/9/9/9/9/9/8r/3K5 w';
  const g = new Game(fen);
  assert.equal(g.moves().length, 1);
  const g1 = new Game(fen); g1.move(sq(0, 8), sq(1, 6)); const key = g1.positions[1];
  // giả lập lịch sử: thế sau nước chiếu đó đã có 2 lần trong chuỗi chiếu của Đỏ
  g.history = [{ side: 'r', check: true }, { side: 'b', check: false }, { side: 'r', check: true }, { side: 'b', check: false }];
  g.positions = ['s', key, 'x', key, g.positions[0]];
  assert.equal(g.moveError(sq(0, 8), sq(1, 6)), 'perpetual');
  assert.deepEqual(g.moves(), []);
  const st = g.status();
  assert.deepEqual([st.over, st.winner, st.reason], [true, 'b', 'perpetual']);
});
