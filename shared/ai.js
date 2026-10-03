/*
 * AI cờ tướng: negamax alpha-beta + iterative deepening + quiescence,
 * sắp xếp nước MVV-LVA, killer & history heuristic, bảng điểm vị trí (PST).
 * Cờ úp: máy chỉ dùng thông tin công khai (FEN có X/x cho quân úp + số quân còn lại có thể nằm dưới quân úp).
 * Quân úp được tính bằng giá trị kỳ vọng của các quân còn có thể nằm dưới đó. Khi một quân úp đi trong cây tìm kiếm,
 * nó thành quân "đã lật nhưng chưa rõ mặt" (Y/y): giữ giá trị kỳ vọng, chặn đường, có thể bị ăn, nhưng không đi tiếp
 * trong lượt tìm kiếm đó (máy không bao giờ đoán/nhìn mặt thật).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./xiangqi'));
  else root.XiangqiAI = factory(root.Xiangqi);
})(typeof self !== 'undefined' ? self : this, function (X) {
  'use strict';
  var genPseudo = X.genPseudo, inCheck = X.inCheck, mFrom = X.mFrom, mTo = X.mTo;
  var VAL = { k: 10000, a: 200, b: 200, n: 400, r: 900, c: 450, p: 100 };
  var MATE = 100000;

  // PST nhìn từ phía Đỏ (hàng 0 = sát cung đối phương). Đen dùng bảng lật dọc.
  var PST = {
    p: [ 9, 9, 9, 11, 13, 11, 9, 9, 9,
        19, 24, 34, 42, 44, 42, 34, 24, 19,
        19, 24, 32, 37, 37, 37, 32, 24, 19,
        19, 23, 27, 29, 30, 29, 27, 23, 19,
        14, 18, 20, 27, 29, 27, 20, 18, 14,
         7, 0, 13, 0, 16, 0, 13, 0, 7,
         7, 0, 7, 0, 15, 0, 7, 0, 7,
         0, 0, 0, 0, 0, 0, 0, 0, 0,
         0, 0, 0, 0, 0, 0, 0, 0, 0,
         0, 0, 0, 0, 0, 0, 0, 0, 0],
    n: [90, 90, 90, 96, 90, 96, 90, 90, 90,
        90, 96, 103, 97, 94, 97, 103, 96, 90,
        92, 98, 99, 103, 99, 103, 99, 98, 92,
        93, 108, 100, 107, 100, 107, 100, 108, 93,
        90, 100, 99, 103, 104, 103, 99, 100, 90,
        90, 98, 101, 102, 103, 102, 101, 98, 90,
        92, 94, 98, 95, 98, 95, 98, 94, 92,
        93, 92, 94, 95, 92, 95, 94, 92, 93,
        85, 90, 92, 93, 78, 93, 92, 90, 85,
        88, 85, 90, 88, 90, 88, 90, 85, 88],
    r: [206, 208, 207, 213, 214, 213, 207, 208, 206,
        206, 212, 209, 216, 233, 216, 209, 212, 206,
        206, 208, 207, 214, 216, 214, 207, 208, 206,
        206, 213, 213, 216, 216, 216, 213, 213, 206,
        208, 211, 211, 214, 215, 214, 211, 211, 208,
        208, 212, 212, 214, 215, 214, 212, 212, 208,
        204, 209, 204, 212, 214, 212, 204, 209, 204,
        198, 208, 204, 212, 212, 212, 204, 208, 198,
        200, 208, 206, 212, 200, 212, 206, 208, 200,
        194, 206, 204, 212, 200, 212, 204, 206, 194],
    c: [100, 100, 96, 91, 90, 91, 96, 100, 100,
        98, 98, 96, 92, 89, 92, 96, 98, 98,
        97, 97, 96, 91, 92, 91, 96, 97, 97,
        96, 99, 99, 98, 100, 98, 99, 99, 96,
        96, 96, 96, 96, 100, 96, 96, 96, 96,
        95, 96, 99, 96, 100, 96, 99, 96, 95,
        96, 96, 96, 96, 96, 96, 96, 96, 96,
        97, 96, 100, 99, 101, 99, 100, 96, 97,
        96, 97, 98, 98, 98, 98, 98, 97, 96,
        96, 96, 97, 99, 99, 99, 97, 96, 96],
    a: [], b: [], k: []
  };
  for (var i = 0; i < 90; i++) { PST.a.push(0); PST.b.push(0); PST.k.push(0); }
  PST.a[8 * 9 + 4] = 6; PST.a[9 * 9 + 3] = 1; PST.a[9 * 9 + 5] = 1;
  PST.b[7 * 9 + 4] = 6; PST.b[9 * 9 + 2] = 2; PST.b[9 * 9 + 6] = 2; PST.b[5 * 9 + 2] = -2; PST.b[5 * 9 + 6] = -2;
  PST.k[9 * 9 + 4] = 6; PST.k[9 * 9 + 3] = 2; PST.k[9 * 9 + 5] = 2; PST.k[8 * 9 + 4] = -8; PST.k[7 * 9 + 4] = -20;
  PST.k[8 * 9 + 3] = -6; PST.k[8 * 9 + 5] = -6; PST.k[7 * 9 + 3] = -16; PST.k[7 * 9 + 5] = -16;
  // chuẩn hoá thành điểm cộng thêm
  var SCALE = { p: [0, 3], n: [90, 4], r: [206, 4], c: [96, 4], a: [0, 3], b: [0, 3], k: [0, 3] };
  var TABLE = {};
  ['p', 'n', 'r', 'c', 'a', 'b', 'k'].forEach(function (t) {
    var red = new Array(90), black = new Array(90);
    for (var s = 0; s < 90; s++) {
      var v = VAL[t] + (PST[t][s] - SCALE[t][0]) * SCALE[t][1];
      red[s] = v;
      var r = (s / 9) | 0, c = s % 9;
      black[(9 - r) * 9 + c] = v;
    }
    TABLE[t.toUpperCase()] = red; TABLE[t] = black;
  });

  function evaluate(b, side, T) {
    T = T || TABLE;
    var s = 0;
    for (var i = 0; i < 90; i++) {
      var p = b[i]; if (!p) continue;
      if (p < 'a') s += T[p][i]; else s -= T[p][i];
    }
    return side === 'r' ? s : -s;
  }

  var PV = {}; 'kabnrcp'.split('').forEach(function (t) { PV[t] = PV[t.toUpperCase()] = VAL[t]; });
  function pieceVal(p) { return VAL[p.toLowerCase()]; }

  // ---------- Cờ úp ----------
  var JQ_VAL = { a: 250, b: 250, n: 400, r: 900, c: 450, p: 100 }; // Sĩ/Tượng đã lật đi khắp bàn -> đáng giá hơn
  var FULL_POOL = { a: 2, b: 2, n: 2, r: 2, c: 2, p: 5 };
  var TOKEN = { X: 'Y', x: 'y' }; // quân úp vừa đi trong cây tìm kiếm
  /** Giá trị kỳ vọng của một quân úp theo bộ quân còn lại (công khai) */
  function expectedValue(pool) {
    pool = pool || FULL_POOL;
    var n = 0, v = 0;
    for (var t in JQ_VAL) { var k = Math.max(0, pool[t] | 0); n += k; v += k * JQ_VAL[t]; }
    return n ? Math.round(v / n) : 0;
  }
  function fill(v) { var a = new Array(90); for (var i = 0; i < 90; i++) a[i] = v; return a; }
  /** Bảng điểm cho cờ úp: T (theo ô) và V (giá trị quân để sắp xếp nước ăn) */
  function jieqiTables(pool) {
    var T = {}, V = {}, k;
    for (k in TABLE) T[k] = TABLE[k];
    ['a', 'b'].forEach(function (t) { T[t] = fill(JQ_VAL[t]); T[t.toUpperCase()] = fill(JQ_VAL[t]); });
    var evR = expectedValue(pool && pool.r), evB = expectedValue(pool && pool.b);
    T.X = fill(evR); T.x = fill(evB);
    T.Y = fill(evR + 12); T.y = fill(evB + 12); // lật quân = ra quân: thưởng nhẹ
    for (k in PV) V[k] = PV[k];
    V.a = V.A = V.b = V.B = JQ_VAL.a;
    V.X = V.Y = evR; V.x = V.y = evB;
    return { T: T, V: V };
  }

  function Searcher(opts) {
    this.maxDepth = opts.depth || 3;
    this.timeMs = opts.timeMs || 2000;
    this.noise = opts.noise || 0;
    this.nodes = 0; this.stop = false;
    this.killers = []; this.history = new Int32Array(128 * 128);
    this.T = TABLE; this.V = PV;
  }

  Searcher.prototype.order = function (b, moves, ply, best) {
    var k = this.killers[ply] || [], h = this.history, scores = new Array(moves.length);
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i], cap = b[mTo(m)], s;
      if (m === best) s = 1e9;
      else if (cap) s = 1e7 + this.V[cap] * 10 - this.V[b[mFrom(m)]] / 10;
      else if (m === k[0] || m === k[1]) s = 1e6;
      else s = h[m];
      scores[i] = s;
    }
    var idx = moves.map(function (_, i) { return i; });
    idx.sort(function (x, y) { return scores[y] - scores[x]; });
    return idx.map(function (i) { return moves[i]; });
  };

  Searcher.prototype.timeUp = function () {
    if ((++this.nodes & 1023) === 0 && Date.now() > this.deadline) this.stop = true;
    return this.stop;
  };

  Searcher.prototype.quiesce = function (b, side, alpha, beta, ply) {
    if (this.timeUp()) return 0;
    var stand = evaluate(b, side, this.T);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply > 40) return stand;
    var moves = this.order(b, genPseudo(b, side, [], true), ply, -1);
    var opp = side === 'r' ? 'b' : 'r';
    for (var i = 0; i < moves.length; i++) {
      var f = mFrom(moves[i]), t = mTo(moves[i]), cap = b[t], mover = b[f];
      if (cap === 'k' || cap === 'K') return MATE - ply;
      b[t] = TOKEN[mover] || mover; b[f] = '';
      if (inCheck(b, side)) { b[f] = mover; b[t] = cap; continue; }
      var sc = -this.quiesce(b, opp, -beta, -alpha, ply + 1);
      b[f] = mover; b[t] = cap;
      if (this.stop) return 0;
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  };

  Searcher.prototype.negamax = function (b, side, depth, alpha, beta, ply) {
    if (this.timeUp()) return 0;
    var checked = inCheck(b, side);
    if (checked && ply < 24) depth++; // gia hạn khi bị chiếu
    if (depth <= 0) return this.quiesce(b, side, alpha, beta, ply);
    var moves = this.order(b, genPseudo(b, side, []), ply, -1);
    var opp = side === 'r' ? 'b' : 'r', legal = 0, best = -MATE;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i], f = mFrom(m), t = mTo(m), cap = b[t], mover = b[f];
      b[t] = TOKEN[mover] || mover; b[f] = '';
      if (inCheck(b, side)) { b[f] = mover; b[t] = cap; continue; }
      legal++;
      var sc = -this.negamax(b, opp, depth - 1, -beta, -alpha, ply + 1);
      b[f] = mover; b[t] = cap;
      if (this.stop) return 0;
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) {
        if (!cap) {
          var k = this.killers[ply] || (this.killers[ply] = [0, 0]);
          if (k[0] !== m) { k[1] = k[0]; k[0] = m; }
          this.history[m] += depth * depth;
        }
        break;
      }
    }
    if (legal === 0) return -MATE + ply; // chiếu bí hoặc hết nước đều thua
    return best;
  };

  /** Nước m của bên side có chiếu tướng đối phương không */
  function givesCheck(b, m, side) {
    var f = mFrom(m), t = mTo(m), cap = b[t];
    b[t] = b[f]; b[f] = '';
    var c = inCheck(b, side === 'r' ? 'b' : 'r');
    b[f] = b[t]; b[t] = cap;
    return c;
  }

  /** Tìm nước tốt nhất. opts (tuỳ chọn): {forbid: function(b, m, side) -> true nếu nước bị cấm (chiếu dai)}.
   *  Trả về {from,to,score,depth,nodes,avoidedCheck} hoặc null nếu không còn nước hợp lệ */
  Searcher.prototype.search = function (board, side, opts) {
    var b = board.slice(); if (board.jq) b.jq = true;
    if (board.jq) { var tb = jieqiTables(opts && opts.pool); this.T = tb.T; this.V = tb.V; }
    this.deadline = Date.now() + this.timeMs;
    var root = X.legalMovesRaw(b, side);
    if (!root.length) return null;
    var avoided = false;
    if (opts && opts.forbid) {
      var ok = root.filter(function (m) { return !opts.forbid(b, m, side); });
      if (!ok.length) return null; // mọi nước đều là chiếu dai bị cấm -> bên này thua (Game.status báo 'perpetual')
      if (ok.length < root.length) { root = ok; avoided = true; }
    }
    var opp = side === 'r' ? 'b' : 'r';
    var bestMove = root[0], bestScore = -MATE, doneDepth = 0, self = this;
    var noiseMap = {};
    root.forEach(function (m) { noiseMap[m] = self.noise ? Math.floor((Math.random() * 2 - 1) * self.noise) : 0; });
    for (var d = 1; d <= this.maxDepth; d++) {
      var ordered = this.order(b, root, 0, bestMove), alpha = -MATE - 1, curBest = ordered[0], curScore = -MATE - 1;
      for (var i = 0; i < ordered.length; i++) {
        var m = ordered[i], f = mFrom(m), t = mTo(m), cap = b[t], mover = b[f];
        b[t] = TOKEN[mover] || mover; b[f] = '';
        var sc = -this.negamax(b, opp, d - 1, -MATE - 1, -alpha + (this.noise ? this.noise : 0), 1) + noiseMap[m];
        b[f] = mover; b[t] = cap;
        if (this.stop) break;
        if (sc > curScore) { curScore = sc; curBest = m; }
        if (sc > alpha) alpha = sc;
      }
      if (this.stop && d > 1) break;
      bestMove = curBest; bestScore = curScore; doneDepth = d;
      if (Math.abs(bestScore) > MATE - 100) break; // đã thấy chiếu bí
      if (this.stop) break;
    }
    return { from: mFrom(bestMove), to: mTo(bestMove), score: bestScore, depth: doneDepth, nodes: this.nodes, avoidedCheck: avoided };
  };

  var LEVELS = {
    1: { name: 'Tập chơi', depth: 1, timeMs: 400, noise: 120 },
    2: { name: 'Dễ', depth: 2, timeMs: 800, noise: 40 },
    3: { name: 'Trung bình', depth: 3, timeMs: 1500, noise: 10 },
    4: { name: 'Khó', depth: 5, timeMs: 3000, noise: 0 },
    5: { name: 'Đại sư', depth: 8, timeMs: 6000, noise: 0 }
  };

  /** opts (tuỳ chọn): {history: [{side, check, pos}]} – lịch sử nước đi (Game.entries()) để máy không bao giờ
   *  chọn nước chiếu dai bị cấm (luật trong xiangqi.js).
   *  Cờ úp: fen công khai (X/x) + opts.pool = Game.hiddenPool() (thông tin công khai). Máy không nhận mặt thật. */
  function bestMove(fen, level, opts) {
    var s = X.parseFen(fen);
    var cfg = LEVELS[level] || LEVELS[3];
    var counts = X.checkRunCounts(opts && opts.history, s.turn);
    var forbid = counts ? function (b, m, side) { return X.isPerpetualMove(b, m, side, counts); } : null;
    return new Searcher(cfg).search(s.board, s.turn, { forbid: forbid, pool: opts && opts.pool });
  }

  return {
    bestMove: bestMove, evaluate: evaluate, Searcher: Searcher, LEVELS: LEVELS, MATE: MATE, expectedValue: expectedValue, jieqiTables: jieqiTables,
    givesCheck: givesCheck
  };
});
