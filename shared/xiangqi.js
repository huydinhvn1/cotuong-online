/*
 * Cờ tướng – bộ luật (dùng chung cho server Node.js, trình duyệt và Web Worker AI)
 * Bàn cờ: mảng 90 ô, chỉ số = hàng*9 + cột. Hàng 0 ở trên (phía Đen), hàng 9 ở dưới (phía Đỏ).
 * Quân: chữ hoa = Đỏ, chữ thường = Đen. k=Tướng a=Sĩ b=Tượng n=Mã r=Xe c=Pháo p=Tốt
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Xiangqi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var INITIAL_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';
  var ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  // [dr, dc, chân mã dr, chân mã dc]
  var HORSE = [[-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
               [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1]];

  function isRed(p) { return p >= 'A' && p <= 'Z'; }
  function sideOf(p) { return p ? (isRed(p) ? 'r' : 'b') : null; }
  function typeOf(p) { return p ? p.toLowerCase() : null; }
  function other(side) { return side === 'r' ? 'b' : 'r'; }
  function inBounds(r, c) { return r >= 0 && r < 10 && c >= 0 && c < 9; }
  function inPalace(r, c, side) { return c >= 3 && c <= 5 && (side === 'r' ? r >= 7 && r <= 9 : r >= 0 && r <= 2); }
  function onOwnSide(r, side) { return side === 'r' ? r >= 5 : r <= 4; }
  function encode(from, to) { return (from << 7) | to; }
  function mFrom(m) { return m >> 7; }
  function mTo(m) { return m & 127; }

  function parseFen(fen) {
    var parts = fen.trim().split(/\s+/);
    var rows = parts[0].split('/');
    if (rows.length !== 10) throw new Error('FEN không hợp lệ');
    var board = [];
    for (var r = 0; r < 10; r++) {
      var row = rows[r];
      for (var i = 0; i < row.length; i++) {
        var ch = row[i];
        if (ch >= '1' && ch <= '9') { for (var k = 0; k < +ch; k++) board.push(''); }
        else board.push(ch);
      }
      if (board.length !== (r + 1) * 9) throw new Error('FEN không hợp lệ ở hàng ' + r);
    }
    var t = (parts[1] || 'w').toLowerCase();
    return { board: board, turn: (t === 'b') ? 'b' : 'r' };
  }

  function boardFen(board) {
    var out = [];
    for (var r = 0; r < 10; r++) {
      var s = '', e = 0;
      for (var c = 0; c < 9; c++) {
        var p = board[r * 9 + c];
        if (!p) e++; else { if (e) { s += e; e = 0; } s += p; }
      }
      if (e) s += e;
      out.push(s);
    }
    return out.join('/');
  }
  function toFen(board, turn) { return boardFen(board) + ' ' + (turn === 'r' ? 'w' : 'b'); }

  function pushIf(b, side, from, r, c, out, capOnly) {
    if (!inBounds(r, c)) return;
    var to = r * 9 + c, t = b[to];
    if (!t) { if (!capOnly) out.push(encode(from, to)); }
    else if (sideOf(t) !== side) out.push(encode(from, to));
  }

  /** Sinh nước đi giả hợp lệ (chưa kiểm tra tự chiếu) cho quân ở ô `from`. */
  function genPieceMoves(b, from, out, capOnly) {
    var p = b[from]; if (!p) return out;
    var side = sideOf(p), t = typeOf(p);
    var r = (from / 9) | 0, c = from % 9, i, nr, nc, d;
    switch (t) {
      case 'k':
        for (i = 0; i < 4; i++) { nr = r + ORTH[i][0]; nc = c + ORTH[i][1]; if (inPalace(nr, nc, side)) pushIf(b, side, from, nr, nc, out, capOnly); }
        break;
      case 'a':
        for (i = 0; i < 4; i++) { nr = r + DIAG[i][0]; nc = c + DIAG[i][1]; if (inPalace(nr, nc, side)) pushIf(b, side, from, nr, nc, out, capOnly); }
        break;
      case 'b':
        for (i = 0; i < 4; i++) {
          nr = r + 2 * DIAG[i][0]; nc = c + 2 * DIAG[i][1];
          if (!inBounds(nr, nc) || !onOwnSide(nr, side)) continue;
          if (b[(r + DIAG[i][0]) * 9 + c + DIAG[i][1]]) continue; // cản mắt tượng
          pushIf(b, side, from, nr, nc, out, capOnly);
        }
        break;
      case 'n':
        for (i = 0; i < 8; i++) {
          d = HORSE[i]; nr = r + d[0]; nc = c + d[1];
          if (!inBounds(nr, nc)) continue;
          if (b[(r + d[2]) * 9 + c + d[3]]) continue; // cản chân mã
          pushIf(b, side, from, nr, nc, out, capOnly);
        }
        break;
      case 'r':
        for (i = 0; i < 4; i++) {
          nr = r + ORTH[i][0]; nc = c + ORTH[i][1];
          while (inBounds(nr, nc)) {
            var x = b[nr * 9 + nc];
            if (!x) { if (!capOnly) out.push(encode(from, nr * 9 + nc)); }
            else { if (sideOf(x) !== side) out.push(encode(from, nr * 9 + nc)); break; }
            nr += ORTH[i][0]; nc += ORTH[i][1];
          }
        }
        break;
      case 'c':
        for (i = 0; i < 4; i++) {
          nr = r + ORTH[i][0]; nc = c + ORTH[i][1];
          var screen = false;
          while (inBounds(nr, nc)) {
            var y = b[nr * 9 + nc];
            if (!screen) {
              if (!y) { if (!capOnly) out.push(encode(from, nr * 9 + nc)); }
              else screen = true;
            } else if (y) {
              if (sideOf(y) !== side) out.push(encode(from, nr * 9 + nc));
              break;
            }
            nr += ORTH[i][0]; nc += ORTH[i][1];
          }
        }
        break;
      case 'p':
        var fwd = side === 'r' ? -1 : 1;
        pushIf(b, side, from, r + fwd, c, out, capOnly);
        if (!onOwnSide(r, side)) { pushIf(b, side, from, r, c - 1, out, capOnly); pushIf(b, side, from, r, c + 1, out, capOnly); }
        break;
    }
    return out;
  }

  function genPseudo(b, side, out, capOnly) {
    out = out || [];
    for (var i = 0; i < 90; i++) { var p = b[i]; if (p && sideOf(p) === side) genPieceMoves(b, i, out, capOnly); }
    return out;
  }

  function findKing(b, side) {
    var k = side === 'r' ? 'K' : 'k';
    var rows = side === 'r' ? [7, 8, 9] : [0, 1, 2];
    for (var j = 0; j < 3; j++) for (var c = 3; c <= 5; c++) if (b[rows[j] * 9 + c] === k) return rows[j] * 9 + c;
    for (var i = 0; i < 90; i++) if (b[i] === k) return i;
    return -1;
  }

  /** Ô `sq` của bên `side` có bị quân đối phương tấn công không (bao gồm luật lộ mặt tướng). */
  function isAttacked(b, sq, side) {
    var r = (sq / 9) | 0, c = sq % 9, enemyRed = side === 'b', i;
    var R = enemyRed ? 'R' : 'r', C = enemyRed ? 'C' : 'c', K = enemyRed ? 'K' : 'k', N = enemyRed ? 'N' : 'n', P = enemyRed ? 'P' : 'p';
    for (i = 0; i < 4; i++) {
      var dr = ORTH[i][0], dc = ORTH[i][1], nr = r + dr, nc = c + dc, screen = false;
      while (inBounds(nr, nc)) {
        var t = b[nr * 9 + nc];
        if (t) {
          if (!screen) { if (t === R || (t === K && dc === 0)) return true; screen = true; }
          else { if (t === C) return true; break; }
        }
        nr += dr; nc += dc;
      }
    }
    for (i = 0; i < 8; i++) {
      var hr = r + HORSE[i][0], hc = c + HORSE[i][1];
      if (!inBounds(hr, hc) || b[hr * 9 + hc] !== N) continue;
      var lr, lc;
      if (Math.abs(HORSE[i][0]) === 2) { lr = hr - HORSE[i][0] / 2; lc = hc; } else { lr = hr; lc = hc - HORSE[i][1] / 2; }
      if (!b[lr * 9 + lc]) return true;
    }
    var pr = r + (enemyRed ? 1 : -1);
    if (inBounds(pr, c) && b[pr * 9 + c] === P) return true;
    if (!onOwnSide(r, enemyRed ? 'r' : 'b')) {
      if (c > 0 && b[r * 9 + c - 1] === P) return true;
      if (c < 8 && b[r * 9 + c + 1] === P) return true;
    }
    return false;
  }

  function inCheck(b, side) { var k = findKing(b, side); return k < 0 ? true : isAttacked(b, k, side); }

  /** Danh sách nước đi hợp lệ (đã loại nước tự chiếu / lộ mặt tướng), dạng số nguyên mã hoá. */
  function legalMovesRaw(b, side) {
    var ps = genPseudo(b, side, []), out = [];
    for (var i = 0; i < ps.length; i++) {
      var f = mFrom(ps[i]), t = mTo(ps[i]), cap = b[t];
      b[t] = b[f]; b[f] = '';
      if (!inCheck(b, side)) out.push(ps[i]);
      b[f] = b[t]; b[t] = cap;
    }
    return out;
  }

  function perft(b, side, depth) {
    if (depth === 0) return 1;
    var ms = legalMovesRaw(b, side), n = 0;
    if (depth === 1) return ms.length;
    for (var i = 0; i < ms.length; i++) {
      var f = mFrom(ms[i]), t = mTo(ms[i]), cap = b[t];
      b[t] = b[f]; b[f] = '';
      n += perft(b, other(side), depth - 1);
      b[f] = b[t]; b[t] = cap;
    }
    return n;
  }

  // ---------- Ký hiệu nước đi kiểu Việt Nam (vd: P2-5, M8.7, X1/2, Xt.1) ----------
  var VN_LETTER = { k: 'Tg', a: 'S', b: 'T', n: 'M', r: 'X', c: 'P', p: 'B' };
  var VN_NAME = { k: 'Tướng', a: 'Sĩ', b: 'Tượng', n: 'Mã', r: 'Xe', c: 'Pháo', p: 'Tốt' };
  function fileNo(c, side) { return side === 'r' ? 9 - c : c + 1; }

  function notation(b, from, to) {
    var p = b[from], side = sideOf(p), t = typeOf(p);
    var fr = (from / 9) | 0, fc = from % 9, tr = (to / 9) | 0, tc = to % 9;
    var label = VN_LETTER[t];
    // các quân cùng loại, cùng cột (quân "trước"/"sau")
    var same = [];
    for (var r = 0; r < 10; r++) if (b[r * 9 + fc] === p) same.push(r);
    if (same.length >= 2 && same.length <= 3 && t !== 'k') {
      same.sort(function (x, y) { return side === 'r' ? x - y : y - x; }); // từ trước ra sau
      var idx = same.indexOf(fr);
      var tags = same.length === 2 ? ['t', 's'] : ['t', 'g', 's'];
      label += tags[idx];
    } else label += fileNo(fc, side);
    var action, num;
    if (fr === tr) { action = '-'; num = fileNo(tc, side); }
    else {
      var forward = side === 'r' ? tr < fr : tr > fr;
      action = forward ? '.' : '/';
      num = (t === 'n' || t === 'b' || t === 'a') ? fileNo(tc, side) : Math.abs(tr - fr);
    }
    return label + action + num;
  }

  function hasAttackers(b) {
    for (var i = 0; i < 90; i++) { var t = typeOf(b[i]); if (t === 'r' || t === 'n' || t === 'c' || t === 'p') return true; }
    return false;
  }

  // ---------- Lớp Game tiện dụng ----------
  function Game(fen) {
    var s = parseFen(fen || INITIAL_FEN);
    this.startFen = fen || INITIAL_FEN;
    this.board = s.board; this.turn = s.turn;
    this.history = []; // {from,to,piece,captured,notation,side}
    this.positions = [boardFen(this.board) + this.turn];
    this.quiet = 0; this.quietStack = [];
  }
  Game.prototype.fen = function () { return toFen(this.board, this.turn); };
  Game.prototype.moves = function () {
    return legalMovesRaw(this.board, this.turn).map(function (m) { return { from: mFrom(m), to: mTo(m) }; });
  };
  Game.prototype.movesFrom = function (sq) {
    return this.moves().filter(function (m) { return m.from === sq; }).map(function (m) { return m.to; });
  };
  Game.prototype.isLegal = function (from, to) {
    var p = this.board[from];
    if (!p || sideOf(p) !== this.turn) return false;
    return this.movesFrom(from).indexOf(to) >= 0;
  };
  Game.prototype.move = function (from, to) {
    from = +from; to = +to;
    if (!(from >= 0 && from < 90 && to >= 0 && to < 90) || !this.isLegal(from, to)) return null;
    var rec = { from: from, to: to, piece: this.board[from], captured: this.board[to] || null,
                notation: notation(this.board, from, to), side: this.turn };
    this.board[to] = this.board[from]; this.board[from] = '';
    this.turn = other(this.turn);
    this.quietStack.push(this.quiet);
    this.quiet = rec.captured ? 0 : this.quiet + 1;
    rec.check = inCheck(this.board, this.turn);
    this.history.push(rec);
    this.positions.push(boardFen(this.board) + this.turn);
    return rec;
  };
  Game.prototype.undo = function () {
    var rec = this.history.pop(); if (!rec) return null;
    this.board[rec.from] = rec.piece; this.board[rec.to] = rec.captured || '';
    this.turn = rec.side; this.positions.pop(); this.quiet = this.quietStack.pop();
    return rec;
  };
  Game.prototype.inCheck = function () { return inCheck(this.board, this.turn); };
  /** Trạng thái ván: {over, winner:'r'|'b'|null, reason, check} */
  Game.prototype.status = function () {
    var check = inCheck(this.board, this.turn);
    if (legalMovesRaw(this.board, this.turn).length === 0)
      return { over: true, winner: other(this.turn), reason: check ? 'checkmate' : 'stalemate', check: check };
    var key = this.positions[this.positions.length - 1], cnt = 0;
    for (var i = 0; i < this.positions.length; i++) if (this.positions[i] === key) cnt++;
    if (cnt >= 3) return { over: true, winner: null, reason: 'repetition', check: check };
    if (this.quiet >= 120) return { over: true, winner: null, reason: 'nocapture', check: check };
    if (!hasAttackers(this.board)) return { over: true, winner: null, reason: 'insufficient', check: check };
    return { over: false, winner: null, reason: null, check: check };
  };

  return {
    INITIAL_FEN: INITIAL_FEN, Game: Game, parseFen: parseFen, toFen: toFen, boardFen: boardFen,
    sideOf: sideOf, typeOf: typeOf, other: other, notation: notation, inCheck: inCheck,
    legalMovesRaw: legalMovesRaw, perft: perft, findKing: findKing, isAttacked: isAttacked,
    genPseudo: genPseudo, genPieceMoves: genPieceMoves, encode: encode, mFrom: mFrom, mTo: mTo,
    VN_NAME: VN_NAME, VN_LETTER: VN_LETTER, sq: function (r, c) { return r * 9 + c; }
  };
});
