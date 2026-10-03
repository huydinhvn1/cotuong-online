/*
 * Cờ tướng – bộ luật (dùng chung cho server Node.js, trình duyệt và Web Worker AI)
 * Bàn cờ: mảng 90 ô, chỉ số = hàng*9 + cột. Hàng 0 ở trên (phía Đen), hàng 9 ở dưới (phía Đỏ).
 * Quân: chữ hoa = Đỏ, chữ thường = Đen. k=Tướng a=Sĩ b=Tượng n=Mã r=Xe c=Pháo p=Tốt
 * Cờ úp (biến thể "jieqi"): X/x = quân đang úp (chưa biết mặt). Bàn cờ cờ úp có thuộc tính board.jq = true
 * (FEN thêm chữ "jq"). Quân úp luôn đứng ở ô xuất phát và đi theo quân vốn đứng ở ô đó; sau nước đầu tiên
 * nó lật ngửa và đi theo mặt thật. Sĩ/Tượng đã lật không bị giới hạn cung/sông (Tượng vẫn bị cản mắt).
 * Mặt thật của quân úp chỉ nằm trong game.secret (không đếm được, không nằm trong FEN) – server giữ, client không có.
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
  function isHidden(p) { return p === 'X' || p === 'x'; }
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
    if (parts.slice(2).indexOf('jq') >= 0) board.jq = true;
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
  function toFen(board, turn) { return boardFen(board) + ' ' + (turn === 'r' ? 'w' : 'b') + (board.jq ? ' jq' : ''); }
  function cloneBoard(b) { var c = b.slice(); if (b.jq) c.jq = true; return c; }

  // ---------- Cờ úp: ô xuất phát ----------
  var INIT_BOARD = parseFen(INITIAL_FEN).board;
  /** Loại quân vốn đứng ở ô sq khi bắt đầu ván (của bên side), không tính Tướng; null nếu không phải ô xuất phát */
  function homeType(sq, side) { var p = INIT_BOARD[sq]; return p && p !== 'k' && p !== 'K' && sideOf(p) === side ? typeOf(p) : null; }
  /** Loại quân dùng để đi: quân úp -> theo ô xuất phát; quân ngửa -> chính nó */
  function effType(b, sq) { var p = b[sq]; if (!p) return null; var t = typeOf(p); return t === 'x' ? homeType(sq, sideOf(p)) : t; }
  var JIEQI_SQUARES = [];
  (function () {
    var i; for (i = 0; i < 90; i++) if (homeType(i, 'r')) JIEQI_SQUARES.push(i);
    for (i = 0; i < 90; i++) if (homeType(i, 'b')) JIEQI_SQUARES.push(i);
  })();
  var JIEQI_SET = 'AABBNNRRCCPPPPP';
  var JIEQI_FEN = (function () {
    var b = INIT_BOARD.slice();
    JIEQI_SQUARES.forEach(function (sq) { b[sq] = sideOf(b[sq]) === 'r' ? 'X' : 'x'; });
    return boardFen(b) + ' w jq';
  })();
  /** Xáo bài cờ úp: chuỗi 30 ký tự (15 quân Đỏ theo thứ tự JIEQI_SQUARES[0..14], rồi 15 quân Đen) */
  function randomDeal(rand) {
    rand = rand || Math.random;
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    return shuffle(JIEQI_SET.split('')).join('') + shuffle(JIEQI_SET.toLowerCase().split('')).join('');
  }
  function validDeal(d) {
    if (typeof d !== 'string' || d.length !== 30) return false;
    var key = JIEQI_SET.split('').sort().join('');
    return d.slice(0, 15).split('').sort().join('') === key && d.slice(15).split('').sort().join('') === key.toLowerCase();
  }

  function pushIf(b, side, from, r, c, out, capOnly) {
    if (!inBounds(r, c)) return;
    var to = r * 9 + c, t = b[to];
    if (!t) { if (!capOnly) out.push(encode(from, to)); }
    else if (sideOf(t) !== side) out.push(encode(from, to));
  }

  /** Sinh nước đi giả hợp lệ (chưa kiểm tra tự chiếu) cho quân ở ô `from`. */
  function genPieceMoves(b, from, out, capOnly) {
    var p = b[from]; if (!p) return out;
    var side = sideOf(p), t = typeOf(p), hid = false, free = false;
    if (t === 'x') { t = homeType(from, side); hid = true; if (!t) return out; } // quân úp đi theo ô xuất phát
    else if (b.jq) free = true; // cờ úp: Sĩ/Tượng đã lật không bị giới hạn cung/sông
    var r = (from / 9) | 0, c = from % 9, i, nr, nc, d;
    switch (t) {
      case 'k':
        for (i = 0; i < 4; i++) { nr = r + ORTH[i][0]; nc = c + ORTH[i][1]; if (inPalace(nr, nc, side)) pushIf(b, side, from, nr, nc, out, capOnly); }
        break;
      case 'a':
        for (i = 0; i < 4; i++) { nr = r + DIAG[i][0]; nc = c + DIAG[i][1]; if (free || inPalace(nr, nc, side)) pushIf(b, side, from, nr, nc, out, capOnly); }
        break;
      case 'b':
        for (i = 0; i < 4; i++) {
          nr = r + 2 * DIAG[i][0]; nc = c + 2 * DIAG[i][1];
          if (!inBounds(nr, nc) || (!free && !onOwnSide(nr, side))) continue;
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
    // cờ úp: quân úp H của đối phương tấn công theo loại quân của ô xuất phát
    var jq = !!b.jq, H = enemyRed ? 'X' : 'x', es = enemyRed ? 'r' : 'b';
    for (i = 0; i < 4; i++) {
      var dr = ORTH[i][0], dc = ORTH[i][1], nr = r + dr, nc = c + dc, screen = false;
      while (inBounds(nr, nc)) {
        var t = b[nr * 9 + nc];
        if (t) {
          if (!screen) { if (t === R || (t === K && dc === 0) || (jq && t === H && homeType(nr * 9 + nc, es) === 'r')) return true; screen = true; }
          else { if (t === C || (jq && t === H && homeType(nr * 9 + nc, es) === 'c')) return true; break; }
        }
        nr += dr; nc += dc;
      }
    }
    for (i = 0; i < 8; i++) {
      var hr = r + HORSE[i][0], hc = c + HORSE[i][1];
      if (!inBounds(hr, hc)) continue;
      var hp = b[hr * 9 + hc];
      if (hp !== N && !(jq && hp === H && homeType(hr * 9 + hc, es) === 'n')) continue;
      var lr, lc;
      if (Math.abs(HORSE[i][0]) === 2) { lr = hr - HORSE[i][0] / 2; lc = hc; } else { lr = hr; lc = hc - HORSE[i][1] / 2; }
      if (!b[lr * 9 + lc]) return true;
    }
    var pr = r + (enemyRed ? 1 : -1);
    if (inBounds(pr, c)) { var pp = b[pr * 9 + c]; if (pp === P || (jq && pp === H && homeType(pr * 9 + c, es) === 'p')) return true; }
    if (!onOwnSide(r, enemyRed ? 'r' : 'b')) {
      if (c > 0 && b[r * 9 + c - 1] === P) return true;
      if (c < 8 && b[r * 9 + c + 1] === P) return true;
    }
    if (jq) { // cờ úp: Sĩ/Tượng đã lật đi khắp bàn nên cũng có thể chiếu
      var A = enemyRed ? 'A' : 'a', B = enemyRed ? 'B' : 'b';
      for (i = 0; i < 4; i++) {
        var ar = r + DIAG[i][0], ac = c + DIAG[i][1];
        if (inBounds(ar, ac)) {
          var ap = b[ar * 9 + ac];
          if (ap === A || (ap === H && homeType(ar * 9 + ac, es) === 'a' && inPalace(r, c, es))) return true;
        }
        var er = r + 2 * DIAG[i][0], ec = c + 2 * DIAG[i][1];
        if (inBounds(er, ec) && !b[ar * 9 + ac]) {
          var ep = b[er * 9 + ec];
          if (ep === B || (ep === H && homeType(er * 9 + ec, es) === 'b' && onOwnSide(r, es))) return true;
        }
      }
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

  // ---------- Luật cấm chiếu dai (chiếu lặp lại) ----------
  // Trong chuỗi nước chiếu liên tiếp không đứt của một bên, nước chiếu tạo lại một thế cờ (bàn cờ + bên đi)
  // lần thứ 3 bị cấm; bên chiếu phải đổi nước. Nước chiếu bí luôn được phép. Nếu bên đó không còn nước nào khác -> thua.
  var PERPETUAL_LIMIT = 3, PERPETUAL_MSG = 'Không được chiếu lặp lại – hãy đổi nước';
  /** Đếm các thế cờ đã có trong chuỗi chiếu hiện tại của side.
   *  entries: [{side, check, pos}] theo thứ tự ván (pos = boardFen + bên đi sau nước đó).
   *  Nước của đối phương ở giữa không làm đứt chuỗi; một nước không chiếu của side thì đứt. */
  function checkRunCounts(entries, side) {
    var counts = {}, any = false;
    for (var i = (entries || []).length - 1; i >= 0; i--) {
      var h = entries[i];
      if (!h) continue;
      if (h.side === side && !h.check) break;
      if (h.side === side && h.pos) { counts[h.pos] = (counts[h.pos] || 0) + 1; if (counts[h.pos] >= PERPETUAL_LIMIT - 1) any = true; }
    }
    return any ? counts : null; // null = chắc chắn không có nước nào bị cấm (đường tắt)
  }
  /** Nước m của side có phải nước chiếu dai bị cấm không (counts từ checkRunCounts) */
  function isPerpetualMove(b, m, side, counts) {
    if (!counts || isHidden(b[mFrom(m)])) return false; // nước lật quân luôn tạo thế cờ mới
    var opp = side === 'r' ? 'b' : 'r', f = mFrom(m), t = mTo(m), cap = b[t], res = false;
    b[t] = b[f]; b[f] = '';
    if ((counts[boardFen(b) + opp] || 0) >= PERPETUAL_LIMIT - 1 && inCheck(b, opp)) {
      res = legalMovesRaw(b, opp).length > 0; // chiếu bí luôn được phép
    }
    b[f] = b[t]; b[t] = cap;
    return res;
  }
  /** Nước hợp lệ có áp luật cấm chiếu dai. entries như checkRunCounts. */
  function legalMovesRules(b, side, entries) {
    var raw = legalMovesRaw(b, side), counts = checkRunCounts(entries, side);
    if (!counts) return raw;
    return raw.filter(function (m) { return !isPerpetualMove(b, m, side, counts); });
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
    var p = b[from], side = sideOf(p), t = effType(b, from);
    var fr = (from / 9) | 0, fc = from % 9, tr = (to / 9) | 0, tc = to % 9;
    var label = VN_LETTER[t];
    // các quân cùng loại, cùng cột (quân "trước"/"sau")
    var same = [];
    for (var r = 0; r < 10; r++) { var q = b[r * 9 + fc]; if (q && sideOf(q) === side && effType(b, r * 9 + fc) === t) same.push(r); }
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
    if (b.jq) { for (var j = 0; j < 90; j++) if (b[j] && typeOf(b[j]) !== 'k') return true; return false; } // cờ úp: Sĩ/Tượng cũng tấn công được
    for (var i = 0; i < 90; i++) { var t = typeOf(b[i]); if (t === 'r' || t === 'n' || t === 'c' || t === 'p') return true; }
    return false;
  }

  // ---------- Lớp Game tiện dụng ----------
  function Game(fen) {
    var s = parseFen(fen || INITIAL_FEN);
    this.startFen = fen || INITIAL_FEN;
    this.board = s.board; this.turn = s.turn;
    this.variant = s.board.jq ? 'jieqi' : 'standard';
    this.history = []; // {from,to,piece,captured,notation,side,check, reveal?, capReal?}
    this.positions = [boardFen(this.board) + this.turn];
    this.quiet = 0; this.quietStack = [];
  }
  Game.prototype.fen = function () { return toFen(this.board, this.turn); };
  /** Lịch sử dạng [{side, check, pos}] (dùng cho luật chiếu dai) */
  Game.prototype.entries = function () {
    var pos = this.positions;
    return this.history.map(function (r, i) { return { side: r.side, check: !!r.check, pos: pos[i + 1] }; });
  };
  Game.prototype.legalRaw = function () { return legalMovesRules(this.board, this.turn, this.entries()); };
  Game.prototype.moves = function () {
    return this.legalRaw().map(function (m) { return { from: mFrom(m), to: mTo(m) }; });
  };
  /** Nước (from,to) là nước chiếu dai bị cấm? (nước vẫn hợp lệ theo luật đi quân) */
  Game.prototype.isPerpetual = function (from, to) {
    var p = this.board[from];
    if (!p || sideOf(p) !== this.turn) return false;
    var m = encode(from, to);
    if (legalMovesRaw(this.board, this.turn).indexOf(m) < 0) return false;
    return isPerpetualMove(this.board, m, this.turn, checkRunCounts(this.entries(), this.turn));
  };
  /** Lý do không đi được: null | 'illegal' | 'perpetual' */
  Game.prototype.moveError = function (from, to) {
    from = +from; to = +to;
    if (!(from >= 0 && from < 90 && to >= 0 && to < 90)) return 'illegal';
    if (this.isPerpetual(from, to)) return 'perpetual';
    return this.isLegal(from, to) ? null : 'illegal';
  };
  /** Các ô đích theo luật đi quân (kể cả nước chiếu dai bị cấm, để giao diện còn báo lý do) */
  Game.prototype.targetsFrom = function (sq) {
    var out = [], ms = legalMovesRaw(this.board, this.turn);
    for (var i = 0; i < ms.length; i++) if (mFrom(ms[i]) === sq) out.push(mTo(ms[i]));
    return out;
  };
  Game.prototype.movesFrom = function (sq) {
    return this.moves().filter(function (m) { return m.from === sq; }).map(function (m) { return m.to; });
  };
  Game.prototype.isLegal = function (from, to) {
    var p = this.board[from];
    if (!p || sideOf(p) !== this.turn) return false;
    return this.movesFrom(from).indexOf(to) >= 0;
  };
  /** Đi quân. info (chỉ dùng ở client cờ úp không có secret): {reveal: mặt thật quân vừa lật, cap: mặt thật quân úp bị ăn} */
  Game.prototype.move = function (from, to, info) {
    from = +from; to = +to;
    if (!(from >= 0 && from < 90 && to >= 0 && to < 90) || !this.isLegal(from, to)) return null;
    var mover = this.board[from], cap = this.board[to] || null, side = this.turn, reveal = null, capReal = null;
    if (isHidden(mover)) reveal = checkFace(this.secret ? this.secret[from] : info && info.reveal, side);
    if (cap && isHidden(cap)) capReal = checkFace(this.secret ? this.secret[to] : info && info.cap, other(side));
    var rec = { from: from, to: to, piece: mover, captured: cap,
                notation: notation(this.board, from, to) + (reveal ? '(' + VN_LETTER[typeOf(reveal)] + ')' : ''), side: side };
    if (reveal) rec.reveal = reveal;
    if (capReal) rec.capReal = capReal;
    this.board[to] = reveal || mover; this.board[from] = '';
    this.turn = other(this.turn);
    this.quietStack.push(this.quiet);
    this.quiet = rec.captured ? 0 : this.quiet + 1;
    rec.check = inCheck(this.board, this.turn);
    this.history.push(rec);
    this.positions.push(boardFen(this.board) + this.turn);
    return rec;
  };
  function checkFace(p, side) { return typeof p === 'string' && p.length === 1 && 'abnrcpABNRCP'.indexOf(p) >= 0 && sideOf(p) === side ? p : null; }
  /** Cờ úp: số quân còn có thể nằm dưới các quân úp của mỗi bên – chỉ dùng thông tin công khai
   *  (bộ quân ban đầu trừ quân đã lật trên bàn và quân đã bị ăn). */
  Game.prototype.hiddenPool = function () {
    if (this.variant !== 'jieqi') return null;
    var pool = { r: { a: 2, b: 2, n: 2, r: 2, c: 2, p: 5 }, b: { a: 2, b: 2, n: 2, r: 2, c: 2, p: 5 } }, i, p;
    for (i = 0; i < 90; i++) { p = this.board[i]; if (p && !isHidden(p) && typeOf(p) !== 'k') pool[sideOf(p)][typeOf(p)]--; }
    for (i = 0; i < this.history.length; i++) { p = this.history[i].capReal || this.history[i].captured; if (p && !isHidden(p) && typeOf(p) !== 'k') pool[sideOf(p)][typeOf(p)]--; }
    ['r', 'b'].forEach(function (s) { for (var k in pool[s]) if (pool[s][k] < 0) pool[s][k] = 0; });
    return pool;
  };
  /** Chuỗi xáo bài (chỉ có khi game giữ secret: server, chơi với máy, hai người một máy) */
  Game.prototype.deal = function () {
    var sec = this.secret; if (!sec) return null;
    return JIEQI_SQUARES.map(function (sq) { return sec[sq]; }).join('');
  };
  Game.prototype.undo = function () {
    var rec = this.history.pop(); if (!rec) return null;
    this.board[rec.from] = rec.piece; this.board[rec.to] = rec.captured || '';
    this.turn = rec.side; this.positions.pop(); this.quiet = this.quietStack.pop();
    return rec;
  };
  /** Lặp thế cờ do một bên chiếu liên tục (từ lần xuất hiện đầu của thế key tới nay mọi nước của bên đó đều chiếu)?
   *  Khi đó không xử hoà 3 lần lặp: bên chiếu dai buộc phải đổi nước (xem isPerpetualMove). */
  Game.prototype.perpetualCycle = function (key) {
    var i0 = this.positions.indexOf(key), h = this.history;
    if (i0 < 0) return false;
    var made = { r: 0, b: 0 }, all = { r: true, b: true };
    for (var i = i0; i < h.length; i++) { made[h[i].side]++; if (!h[i].check) all[h[i].side] = false; }
    return (made.r > 0 && all.r) || (made.b > 0 && all.b);
  };
  Game.prototype.inCheck = function () { return inCheck(this.board, this.turn); };
  /** Trạng thái ván: {over, winner:'r'|'b'|null, reason, check} */
  Game.prototype.status = function () {
    var check = inCheck(this.board, this.turn);
    if (legalMovesRaw(this.board, this.turn).length === 0)
      return { over: true, winner: other(this.turn), reason: check ? 'checkmate' : 'stalemate', check: check };
    // còn nước nhưng nước nào cũng là chiếu dai bị cấm -> bên chiếu dai thua
    if (this.legalRaw().length === 0) return { over: true, winner: other(this.turn), reason: 'perpetual', check: check };
    var key = this.positions[this.positions.length - 1], cnt = 0;
    for (var i = 0; i < this.positions.length; i++) if (this.positions[i] === key) cnt++;
    if (cnt >= 3 && !this.perpetualCycle(key)) return { over: true, winner: null, reason: 'repetition', check: check };
    if (this.quiet >= 120) return { over: true, winner: null, reason: 'nocapture', check: check };
    if (!hasAttackers(this.board)) return { over: true, winner: null, reason: 'insufficient', check: check };
    return { over: false, winner: null, reason: null, check: check };
  };

  /** Tạo ván: variant 'standard' | 'jieqi'. Cờ úp: deal = chuỗi xáo bài (randomDeal) để biết mặt thật;
   *  bỏ trống deal -> ván "công khai" (client online), mặt thật lấy từ thông tin server gửi khi quân được lật. */
  function createGame(variant, deal) {
    if (variant !== 'jieqi') return new Game();
    var g = new Game(JIEQI_FEN);
    if (deal != null) {
      if (!validDeal(deal)) throw new Error('Chuỗi xáo bài cờ úp không hợp lệ');
      var sec = []; for (var i = 0; i < 90; i++) sec.push('');
      JIEQI_SQUARES.forEach(function (sq, k) { sec[sq] = deal[k]; });
      Object.defineProperty(g, 'secret', { value: sec, enumerable: false, writable: false }); // không lọt vào JSON
    }
    return g;
  }

  return {
    INITIAL_FEN: INITIAL_FEN, Game: Game, createGame: createGame, JIEQI_FEN: JIEQI_FEN, JIEQI_SQUARES: JIEQI_SQUARES,
    randomDeal: randomDeal, validDeal: validDeal, isHidden: isHidden, homeType: homeType, effType: effType, cloneBoard: cloneBoard, parseFen: parseFen, toFen: toFen, boardFen: boardFen,
    sideOf: sideOf, typeOf: typeOf, other: other, notation: notation, inCheck: inCheck,
    legalMovesRaw: legalMovesRaw, perft: perft, findKing: findKing, isAttacked: isAttacked,
    genPseudo: genPseudo, genPieceMoves: genPieceMoves, encode: encode, mFrom: mFrom, mTo: mTo,
    checkRunCounts: checkRunCounts, isPerpetualMove: isPerpetualMove, legalMovesRules: legalMovesRules,
    PERPETUAL_LIMIT: PERPETUAL_LIMIT, PERPETUAL_MSG: PERPETUAL_MSG,
    VN_NAME: VN_NAME, VN_LETTER: VN_LETTER, sq: function (r, c) { return r * 9 + c; }
  };
});
