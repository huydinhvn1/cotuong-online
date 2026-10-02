/* Cờ Tướng Online – giao diện người dùng */
(function () {
  'use strict';
  var X = window.Xiangqi;
  var $ = function (s) { return document.querySelector(s); };
  var CH = { K: '帥', A: '仕', B: '相', N: '傌', R: '俥', C: '炮', P: '兵', k: '將', a: '士', b: '象', n: '馬', r: '車', c: '砲', p: '卒' };
  var VAL = { k: 0, r: 9, c: 4.5, n: 4, b: 2, a: 2, p: 1 };
  var LEVEL_NAMES = { 1: 'Tập chơi', 2: 'Dễ', 3: 'Vừa', 4: 'Khó', 5: 'Đại sư' };
  var SIDE_NAME = { r: 'Đỏ', b: 'Đen' };
  var REASON = {
    checkmate: 'Chiếu bí', stalemate: 'Hết nước đi (bị vây)', timeout: 'Hết giờ', resign: 'Xin thua',
    agreement: 'Hai bên đồng ý hoà', repetition: 'Lặp lại thế cờ 3 lần', nocapture: '120 nước liên tiếp không ăn quân',
    insufficient: 'Không còn quân tấn công'
  };
  var ICONS = {
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    draw: '<path d="M12 3v18"/><path d="M5 8h14"/><path d="m5 8-3 7a4 4 0 0 0 6 0z"/><path d="m19 8-3 7a4 4 0 0 0 6 0z"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    flip: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
    vol: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/>',
    bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    exit: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + '</svg>'; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : 'x' + Math.random().toString(36).slice(2) + Date.now().toString(36)); }

  var token = store.get('ct_token') || uuid(); store.set('ct_token', token);
  var myName = store.get('ct_name', '');

  // ================= Âm thanh (WebAudio, không cần file) =================
  var Sound = {
    on: store.get('ct_sound', '1') === '1', ctx: null,
    init: function () { if (!this.ctx) { var C = window.AudioContext || window.webkitAudioContext; if (C) this.ctx = new C(); } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    clack: function (t, vol, freq) {
      var ctx = this.ctx, len = 0.07, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
      var g = ctx.createGain(); g.gain.value = vol;
      src.connect(f).connect(g).connect(ctx.destination); src.start(t);
      var o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.08);
      og.gain.setValueAtTime(vol * 0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(og).connect(ctx.destination); o.start(t); o.stop(t + 0.12);
    },
    tone: function (t, f, dur, vol) {
      var ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.05);
    },
    play: function (kind) {
      if (!this.on) return; this.init(); if (!this.ctx) return;
      var t = this.ctx.currentTime;
      if (kind === 'move') this.clack(t, 0.9, 1900);
      else if (kind === 'capture') { this.clack(t, 1.2, 1400); this.clack(t + 0.06, 0.7, 2400); }
      else if (kind === 'check') { this.clack(t, 1, 1700); this.tone(t + 0.05, 740, 0.18, 0.18); this.tone(t + 0.2, 988, 0.25, 0.18); }
      else if (kind === 'win') [523, 659, 784, 1047].forEach(function (f, i) { Sound.tone(t + i * 0.12, f, 0.35, 0.15); });
      else if (kind === 'lose') [392, 330, 262].forEach(function (f, i) { Sound.tone(t + i * 0.16, f, 0.4, 0.14); });
      else if (kind === 'notify') this.tone(t, 880, 0.15, 0.12);
      else if (kind === 'chat') { this.tone(t, 988, 0.12, 0.06); this.tone(t + 0.09, 1319, 0.18, 0.05); }
    }
  };
  function renderSoundBtn() { $('#soundBtn').innerHTML = icon(Sound.on ? 'vol' : 'mute'); }
  $('#soundBtn').onclick = function () { Sound.on = !Sound.on; store.set('ct_sound', Sound.on ? '1' : '0'); renderSoundBtn(); if (Sound.on) Sound.play('move'); };
  renderSoundBtn();

  // ================= Trạng thái =================
  var S = {
    mode: null, game: new X.Game(), moves: [], myColor: null, flipped: false,
    status: 'playing', result: null, pending: null, seats: { r: null, b: null }, spectators: 0,
    clocks: null, running: null, clockAt: 0, timeControl: null, roomId: null, gameNo: 0,
    selected: null, legal: [], hint: null, ai: { level: 3, thinking: false, req: 0 }
  };

  function toast(text, err) {
    var el = document.createElement('div'); el.className = 'toast' + (err ? ' err' : ''); el.textContent = text;
    $('#toasts').appendChild(el); setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(function () { el.remove(); }, 3000);
  }

  // ================= Bàn cờ =================
  var boardEl = $('#board'), piecesEl = $('#pieces'), hintsEl = $('#hints'), marksEl = $('#marks');
  var pieceEls = new Map(), prevBoard = null;

  // Hình học bàn cờ (đơn vị SVG): lề 0.8 ô quanh lưới để quân ở mép nằm trọn trong khung gỗ
  var BM = 80, BW = 960, BH = 1060;
  window.__geo = { M: BM, W: BW, H: BH };
  function scr(sq) { var r = (sq / 9) | 0, c = sq % 9; if (S.flipped) { r = 9 - r; c = 8 - c; } return { r: r, c: c }; }
  function posStyle(el, sq) { var p = scr(sq); el.style.left = ((BM + p.c * 100) / BW * 100) + '%'; el.style.top = ((BM + p.r * 100) / BH * 100) + '%'; }

  function renderGrid() {
    var s = '', i, x = function (c) { return BM + c * 100; }, y = function (r) { return BM + r * 100; };
    s += '<rect class="frame" x="' + (BM - 14) + '" y="' + (BM - 14) + '" width="828" height="928"/>';
    for (i = 0; i < 10; i++) s += '<line class="l" x1="' + x(0) + '" x2="' + x(8) + '" y1="' + y(i) + '" y2="' + y(i) + '"/>';
    for (i = 0; i < 9; i++) {
      if (i === 0 || i === 8) s += '<line class="l" x1="' + x(i) + '" x2="' + x(i) + '" y1="' + y(0) + '" y2="' + y(9) + '"/>';
      else s += '<line class="l" x1="' + x(i) + '" x2="' + x(i) + '" y1="' + y(0) + '" y2="' + y(4) + '"/><line class="l" x1="' + x(i) + '" x2="' + x(i) + '" y1="' + y(5) + '" y2="' + y(9) + '"/>';
    }
    var P = function (c, r) { return x(c) + ' ' + y(r); };
    s += '<path class="l" d="M' + P(3, 0) + ' L' + P(5, 2) + ' M' + P(5, 0) + ' L' + P(3, 2) + ' M' + P(3, 7) + ' L' + P(5, 9) + ' M' + P(5, 7) + ' L' + P(3, 9) + '"/>';
    var spots = [[2, 1], [2, 7], [7, 1], [7, 7]];
    [3, 6].forEach(function (r) { [0, 2, 4, 6, 8].forEach(function (c) { spots.push([r, c]); }); });
    var g = 9, L = 20, d = '';
    spots.forEach(function (p) {
      var cx = x(p[1]), cy = y(p[0]);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        var nc = p[1] + q[0]; if (nc < 0 || nc > 8) return;
        d += 'M' + (cx + q[0] * g) + ' ' + (cy + q[1] * (g + L)) + 'L' + (cx + q[0] * g) + ' ' + (cy + q[1] * g) + 'L' + (cx + q[0] * (g + L)) + ' ' + (cy + q[1] * g);
      });
    });
    s += '<path class="l" d="' + d + '"/>';
    s += '<text class="river" x="' + (x(2) - 15) + '" y="' + (y(4) + 42) + '" text-anchor="middle" dominant-baseline="middle">楚 河</text>';
    s += '<text class="river" x="' + (x(6) + 15) + '" y="' + (y(4) + 42) + '" text-anchor="middle" dominant-baseline="middle">漢 界</text>';
    s += '<text class="river-vn" x="' + (x(2) - 15) + '" y="' + (y(4) + 88) + '" text-anchor="middle">Sở Hà</text>';
    s += '<text class="river-vn" x="' + (x(6) + 15) + '" y="' + (y(4) + 88) + '" text-anchor="middle">Hán Giới</text>';
    var bottom = S.flipped ? 'b' : 'r', top = X.other(bottom);
    for (i = 0; i < 9; i++) {
      var c = S.flipped ? 8 - i : i;
      var fb = bottom === 'r' ? 9 - c : c + 1, ft = top === 'r' ? 9 - c : c + 1;
      s += '<text class="num" x="' + x(i) + '" y="' + (BM - 56) + '" text-anchor="middle" dominant-baseline="middle">' + ft + '</text>';
      s += '<text class="num" x="' + x(i) + '" y="' + (BH - BM + 56) + '" text-anchor="middle" dominant-baseline="middle">' + fb + '</text>';
    }
    $('#grid').innerHTML = s;
  }

  function makePiece(p, sq) {
    var el = document.createElement('div');
    el.className = 'piece ' + (p < 'a' ? 'r' : 'b');
    el.innerHTML = '<span>' + CH[p] + '</span>';
    el.dataset.p = p; posStyle(el, sq);
    piecesEl.appendChild(el); return el;
  }
  function rebuildPieces(board) {
    piecesEl.innerHTML = ''; pieceEls.clear();
    for (var i = 0; i < 90; i++) if (board[i]) pieceEls.set(i, makePiece(board[i], i));
  }
  function sameBoard(a, b) { if (!a || !b) return false; for (var i = 0; i < 90; i++) if ((a[i] || '') !== (b[i] || '')) return false; return true; }

  function renderPieces(force) {
    var board = S.game.board, last = S.moves[S.moves.length - 1];
    if (force || !prevBoard) rebuildPieces(board);
    else if (!sameBoard(prevBoard, board)) {
      var applied = null;
      if (last) { applied = prevBoard.slice(); applied[last.to] = applied[last.from]; applied[last.from] = ''; }
      if (applied && sameBoard(applied, board) && pieceEls.has(last.from)) {
        var el = pieceEls.get(last.from), cap = pieceEls.get(last.to);
        if (cap) { cap.classList.add('captured-out'); setTimeout(function () { cap.remove(); }, 300); }
        pieceEls.delete(last.from); pieceEls.set(last.to, el); el.classList.remove('drag'); posStyle(el, last.to);
      } else rebuildPieces(board);
    }
    prevBoard = board.slice();
    var checkedK = -1;
    if (S.game.inCheck() && !(S.result && S.result.reason === 'resign')) checkedK = X.findKing(board, S.game.turn);
    pieceEls.forEach(function (el, sq) {
      var p = board[sq];
      el.classList.toggle('mine', canMove() && X.sideOf(p) === S.myColor);
      el.classList.toggle('sel', sq === S.selected);
      el.classList.toggle('last', !!last && sq === last.to);
      el.classList.toggle('checked', sq === checkedK);
    });
    // dấu nước đi trước
    marksEl.innerHTML = '';
    if (last) { var m = document.createElement('div'); m.className = 'mark-from'; posStyle(m, last.from); marksEl.appendChild(m); }
    if (S.hint) S.hint.forEach(function (sq) { var h = document.createElement('div'); h.className = 'mark-from'; h.style.borderColor = 'rgba(217,166,73,.95)'; h.style.background = 'rgba(217,166,73,.25)'; posStyle(h, sq); marksEl.appendChild(h); });
    renderHints();
  }
  function renderHints() {
    hintsEl.innerHTML = '';
    S.legal.forEach(function (sq) {
      var d = document.createElement('div'); d.className = 'hint' + (S.game.board[sq] ? ' cap' : '');
      posStyle(d, sq); hintsEl.appendChild(d);
    });
  }

  function isOver() { return S.status === 'over'; }
  function canMove() {
    if (!S.myColor || isOver() || S.game.turn !== S.myColor) return false;
    if (S.mode === 'online') return S.status === 'playing';
    if (S.mode === 'ai') return !S.ai.thinking;
    return false;
  }

  // ---------- Tương tác chuột / chạm (bấm hoặc kéo thả) ----------
  function hit(e) {
    var rc = boardEl.getBoundingClientRect();
    var x = (e.clientX - rc.left) / rc.width * BW, y = (e.clientY - rc.top) / rc.height * BH;
    var c = Math.round((x - BM) / 100), r = Math.round((y - BM) / 100);
    if (c < 0 || c > 8 || r < 0 || r > 9) return -1;
    if (Math.hypot(x - (BM + c * 100), y - (BM + r * 100)) > 58) return -1;
    if (S.flipped) { r = 9 - r; c = 8 - c; }
    return r * 9 + c;
  }
  var drag = null;
  function select(sq) {
    S.selected = sq; S.legal = sq == null ? [] : S.game.movesFrom(sq);
    pieceEls.forEach(function (el, s) { el.classList.toggle('sel', s === sq); });
    renderHints();
  }
  boardEl.addEventListener('pointerdown', function (e) {
    Sound.init();
    var sq = hit(e); if (sq < 0) { select(null); return; }
    var p = S.game.board[sq];
    if (S.selected != null && S.legal.indexOf(sq) >= 0) { tryMove(S.selected, sq); return; }
    if (p && canMove() && X.sideOf(p) === S.myColor) {
      select(sq);
      drag = { sq: sq, el: pieceEls.get(sq), x: e.clientX, y: e.clientY, moving: false };
      boardEl.setPointerCapture(e.pointerId);
    } else select(null);
  });
  boardEl.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (!drag.moving && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.moving = true; drag.el.classList.add('drag');
    var rc = boardEl.getBoundingClientRect();
    drag.el.style.left = ((e.clientX - rc.left) / rc.width * 100) + '%';
    drag.el.style.top = ((e.clientY - rc.top) / rc.height * 100) + '%';
  });
  function endDrag(e) {
    if (!drag) return;
    var d = drag; drag = null;
    if (!d.moving) return;
    d.el.classList.remove('drag');
    var sq = e ? hit(e) : -1;
    if (sq >= 0 && S.legal.indexOf(sq) >= 0) {
      // đặt luôn quân tại chỗ thả để không bị "bay" ngược
      d.el.style.transition = 'none'; posStyle(d.el, sq); void d.el.offsetWidth; d.el.style.transition = '';
      tryMove(d.sq, sq);
    } else posStyle(d.el, d.sq);
  }
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', function () { endDrag(null); });

  function soundFor(mv) { Sound.play(mv.check ? 'check' : mv.cap ? 'capture' : 'move'); }
  function flashCheck() { var f = $('#flash'); f.textContent = 'Chiếu tướng!'; f.classList.remove('show'); void f.offsetWidth; f.classList.add('show'); }

  function tryMove(from, to) {
    if (!canMove()) return;
    var rec = S.game.move(from, to); if (!rec) return;
    var mv = { from: from, to: to, n: rec.notation, side: rec.side, cap: rec.captured, check: rec.check };
    S.moves.push(mv); S.selected = null; S.legal = []; S.hint = null;
    soundFor(mv); if (mv.check) flashCheck();
    if (S.mode === 'online') {
      Net.send({ type: 'move', from: from, to: to });
      renderAll();
    } else if (S.mode === 'ai') { afterAIModeMove(); }
  }

  // ================= Hiển thị bảng bên =================
  function capturedBy(side) {
    var list = S.moves.filter(function (m) { return m.side === side && m.cap; }).map(function (m) { return m.cap; });
    list.sort(function (a, b) { return VAL[b.toLowerCase()] - VAL[a.toLowerCase()]; });
    return list;
  }
  function fmtClock(ms) {
    ms = Math.max(0, ms); var s = Math.ceil(ms / 1000);
    if (ms < 10000) return '0:' + (ms / 1000).toFixed(1).padStart(4, '0');
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function clockOf(side) {
    if (!S.clocks) return null;
    var v = S.clocks[side];
    if (S.running === side && !isOver()) v -= Date.now() - S.clockAt;
    return v;
  }
  function renderBars() {
    var bottom = S.flipped ? 'b' : 'r';
    [['#barBottom', bottom], ['#barTop', X.other(bottom)]].forEach(function (pair) {
      var side = pair[1], el = $(pair[0]), seat = S.seats[side], h = '';
      var name, sub = '', online = null, isMe = S.myColor === side;
      if (S.mode === 'ai') {
        name = isMe ? (myName || 'Bạn') : 'Máy · ' + LEVEL_NAMES[S.ai.level];
      } else {
        name = seat ? seat.name : 'Ghế trống';
        online = seat ? seat.online : null;
      }
      var caps = capturedBy(side).map(function (p) { return '<span class="' + (p < 'a' ? 'r' : 'b') + '">' + CH[p] + '</span>'; }).join('');
      sub = caps ? '<span class="captured">' + caps + '</span>' : '<span>' + (isMe ? 'Bạn · ' : '') + 'Quân ' + SIDE_NAME[side] + '</span>';
      h += '<div class="avatar ' + side + '">' + CH[side === 'r' ? 'K' : 'k'] + '</div>';
      h += '<div class="pinfo"><div class="pname">' + (online !== null ? '<i class="dot' + (online ? ' on' : '') + '" title="' + (online ? 'Đang online' : 'Mất kết nối') + '"></i>' : '') +
        esc(name) + (isMe && S.mode === 'online' ? ' <small style="color:var(--gold2);font-weight:600">(bạn)</small>' : '') + '</div><div class="psub">' + sub + '</div></div>';
      if (S.mode === 'online' && !seat && !S.myColor && S.status !== 'playing') h += '<button class="btn primary sit-btn" data-sit="' + side + '">Ngồi vào</button>';
      if (S.clocks) h += '<div class="clock" data-clock="' + side + '">' + fmtClock(clockOf(side)) + '</div>';
      el.innerHTML = h;
      el.classList.toggle('active', !isOver() && S.game.turn === side && (S.mode === 'ai' || S.status === 'playing'));
    });
  }
  function tickClocks() {
    if (!S.clocks) return;
    document.querySelectorAll('[data-clock]').forEach(function (el) {
      var side = el.dataset.clock, v = clockOf(side);
      el.textContent = fmtClock(v);
      el.classList.toggle('low', v < 30000 && S.running === side && !isOver());
    });
  }
  setInterval(tickClocks, 100);

  function statusText() {
    if (isOver()) {
      var r = S.result || {};
      if (!r.winner) return { t: 'Hoà cờ · ' + (REASON[r.reason] || ''), cls: '' };
      return { t: (S.myColor ? (r.winner === S.myColor ? 'Bạn thắng' : 'Bạn thua') : SIDE_NAME[r.winner] + ' thắng') + ' · ' + (REASON[r.reason] || ''), cls: '', dot: r.winner };
    }
    if (S.mode === 'online' && S.status === 'waiting') return { t: 'Đang chờ đối thủ vào phòng…', cls: '' };
    var turn = S.game.turn, chk = S.game.inCheck(), t;
    if (S.mode === 'ai' && S.ai.thinking) t = 'Máy đang suy nghĩ <span class="thinking"><i></i><i></i><i></i></span>';
    else if (S.myColor) t = turn === S.myColor ? 'Đến lượt bạn' : 'Đối thủ đang suy nghĩ…';
    else t = 'Lượt quân ' + SIDE_NAME[turn];
    if (chk) t += ' — Chiếu tướng!';
    return { t: t, cls: chk ? 'check' : '', dot: turn };
  }
  var baseTitle = 'Cờ Tướng Online';
  function updateTitle() { document.title = (document.hidden && unread) ? '(' + unread + ') Tin nhắn mới – Cờ Tướng' : baseTitle; }
  function renderStatus() {
    var st = statusText(), el = $('#status');
    el.className = 'status ' + st.cls;
    el.innerHTML = (st.dot ? '<i class="turn-dot ' + st.dot + '"></i>' : '') + '<span>' + st.t + '</span>';
    var myTurn = S.mode === 'online' && canMove();
    baseTitle = (myTurn ? '● Đến lượt bạn – ' : '') + 'Cờ Tướng Online'; updateTitle();
  }
  function renderOffer() {
    var el = $('#offer'), p = S.pending;
    if (S.mode !== 'online' || !p) { el.hidden = true; return; }
    var label = { undo: 'xin đi lại', draw: 'cầu hoà', rematch: 'muốn chơi ván mới (đổi màu quân)' }[p.type];
    var who = S.seats[p.by] ? S.seats[p.by].name : SIDE_NAME[p.by];
    el.hidden = false;
    if (p.by === S.myColor) el.innerHTML = 'Đang chờ đối thủ trả lời lời ' + label.replace(' (đổi màu quân)', '') + '…<div class="row"><button class="btn" data-act="cancel">Huỷ</button></div>';
    else if (S.myColor) el.innerHTML = '<b>' + esc(who) + '</b> ' + label + '.<div class="row"><button class="btn primary" data-act="accept">Đồng ý</button><button class="btn" data-act="decline">Từ chối</button></div>';
    else el.innerHTML = esc(who) + ' ' + label + '.';
  }
  function btn(act, ic, label, opts) {
    opts = opts || {};
    return '<button class="btn' + (opts.cls ? ' ' + opts.cls : '') + '" data-act="' + act + '"' + (opts.disabled ? ' disabled' : '') + '>' + icon(ic) + '<span>' + label + '</span></button>';
  }
  function renderControls() {
    var h = '', over = isOver();
    if (S.mode === 'ai') {
      var humanMoved = S.moves.some(function (m) { return m.side === S.myColor; });
      h += btn('undo', 'undo', 'Đi lại', { disabled: !humanMoved });
      h += btn('hint', 'bulb', 'Gợi ý', { disabled: !canMove() });
      h += btn('resign', 'flag', 'Xin thua', { disabled: over || !S.moves.length, cls: 'danger' });
      h += btn('new', 'refresh', 'Ván mới');
      h += btn('flip', 'flip', 'Lật bàn');
      h += btn('leave', 'exit', 'Về sảnh');
    } else if (S.mode === 'online') {
      var me = S.myColor, playing = S.status === 'playing', busy = !!S.pending;
      if (me) {
        var moved = S.moves.some(function (m) { return m.side === me; });
        h += btn('undo', 'undo', 'Xin đi lại', { disabled: !playing || !moved || busy });
        h += btn('draw', 'draw', 'Cầu hoà', { disabled: !playing || busy });
        h += btn('resign', 'flag', 'Xin thua', { disabled: !playing, cls: 'danger' });
        h += btn('rematch', 'refresh', over ? 'Chơi lại' : 'Ván mới', { disabled: busy || (!over && !S.moves.length) });
      }
      h += btn('flip', 'flip', 'Lật bàn');
      h += btn('leave', 'exit', 'Rời phòng');
    }
    $('#controls').innerHTML = h;
  }
  function renderMoves() {
    var el = $('#moves'), h = '', ms = S.moves;
    if (!ms.length) { el.innerHTML = '<li class="empty">Chưa có nước đi nào</li>'; return; }
    var startBlack = ms[0].side === 'b';
    var rows = [], i = 0;
    if (startBlack) { rows.push([null, ms[0]]); i = 1; }
    for (; i < ms.length; i += 2) rows.push([ms[i], ms[i + 1]]);
    rows.forEach(function (row, k) {
      h += '<li><span class="no">' + (k + 1) + '.</span>';
      row.forEach(function (m) {
        if (!m) { h += '<span></span>'; return; }
        var cur = m === ms[ms.length - 1];
        h += '<span class="mv ' + m.side + (cur ? ' cur' : '') + '">' + esc(m.n) + (m.check ? '<span class="chk">+</span>' : '') + '</span>';
      });
      h += '</li>';
    });
    el.innerHTML = h; el.scrollTop = el.scrollHeight;
  }
  function roomLink() { return location.origin + '/r/' + S.roomId; }
  function renderRoomPanel() {
    var el = $('#roomPanel'), h = '';
    if (S.mode === 'online') {
      var tc = S.timeControl ? (S.timeControl.base / 60000) + ' phút' + (S.timeControl.inc ? ' + ' + S.timeControl.inc / 1000 + 's' : '') : 'Không giới hạn';
      h += '<div class="room-head"><div><div class="room-label">Mã phòng</div><div class="room-code">' + S.roomId + '</div></div>' +
        '<button class="icon-btn" data-act="copycode" title="Sao chép mã">' + icon('copy') + '</button></div>';
      h += '<div class="room-meta"><span>⏱ ' + tc + '</span><span>👁 ' + S.spectators + ' người xem</span><span>Ván #' + S.gameNo + '</span></div>';
      h += '<div class="share-row"><div class="link">' + esc(roomLink()) + '</div><button class="btn primary" data-act="share">' + icon('share') + 'Mời bạn</button></div>';
    } else if (S.mode === 'ai') {
      h += '<div class="room-head"><div><div class="room-label">Chơi với máy</div><div class="room-code" style="letter-spacing:0;font-size:22px">Cấp ' + LEVEL_NAMES[S.ai.level] + '</div></div>' +
        '<div class="avatar ' + S.myColor + '">' + CH[S.myColor === 'r' ? 'K' : 'k'] + '</div></div>';
      h += '<div class="room-meta"><span>Bạn cầm quân ' + SIDE_NAME[S.myColor] + '</span><span>Ván được tự lưu</span></div>';
    }
    el.innerHTML = h;
  }
  function renderAll(forcePieces) {
    renderPieces(forcePieces); renderBars(); renderStatus(); renderOffer(); renderControls(); renderMoves(); renderRoomPanel(); tickClocks();
    updateFab();
  }

  // ---------- Nút điều khiển ----------
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act],[data-sit]'); if (!b || b.disabled) return;
    if (b.dataset.sit) { Net.send({ type: 'sit', color: b.dataset.sit }); return; }
    var act = b.dataset.act;
    if (act === 'flip') { S.flipped = !S.flipped; renderGrid(); renderAll(true); return; }
    if (act === 'leave') { leaveGame(); return; }
    if (act === 'copycode') { copy(S.roomId, 'Đã sao chép mã phòng'); return; }
    if (act === 'share') {
      var url = roomLink();
      if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) navigator.share({ title: 'Cờ Tướng Online', text: 'Vào chơi cờ tướng với mình nhé! Mã phòng ' + S.roomId, url: url }).catch(function () { });
      else copy(url, 'Đã sao chép link mời – gửi cho bạn bè nhé!');
      return;
    }
    if (act === 'modal-close') { closeModal(); return; }
    if (S.mode === 'online') {
      var map = { undo: 'undo_request', draw: 'draw_offer', resign: null, rematch: 'rematch', cancel: 'cancel' };
      if (act === 'resign') { confirmBox('Xin thua ván này?', 'Đối thủ sẽ được tính thắng.', 'Xin thua', function () { Net.send({ type: 'resign' }); }); return; }
      if (act === 'accept' || act === 'decline') { if ($('#modal').dataset.kind === 'offer') closeModal(); Net.send({ type: 'respond', accept: act === 'accept' }); return; }
      if (act === 'modal-rematch') { closeModal(); Net.send({ type: 'rematch' }); return; }
      if (map[act]) Net.send({ type: map[act] });
    } else if (S.mode === 'ai') {
      if (act === 'undo') aiUndo();
      else if (act === 'hint') aiHint();
      else if (act === 'resign') confirmBox('Xin thua ván này?', '', 'Xin thua', function () { S.status = 'over'; S.result = { winner: X.other(S.myColor), reason: 'resign' }; saveAI(); endGameUI(); });
      else if (act === 'new' || act === 'modal-rematch') { closeModal(); startAI(S.ai.level, S.myColor); }
    }
  });
  function copy(text, msg) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(msg); }, function () {
      var t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', '');
      t.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;font-size:16px'; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); toast(msg); } catch (e) { toast(text); } t.remove();
    });
  }

  // ---------- Modal ----------
  function openModal(html, kind) { $('#modalCard').innerHTML = html; $('#modal').hidden = false; $('#modal').dataset.kind = kind || ''; }
  function closeModal() { $('#modal').hidden = true; $('#modal').dataset.kind = ''; }
  function showOfferModal(p) {
    var label = { undo: 'xin đi lại nước vừa rồi', draw: 'đề nghị hoà cờ', rematch: 'muốn chơi ván mới (hai bên đổi màu quân)' }[p.type];
    var who = S.seats[p.by] ? S.seats[p.by].name : 'Đối thủ';
    var ic = { undo: '悔', draw: '和', rematch: '再' }[p.type];
    openModal('<div class="piece big-piece ' + p.by + '" style="left:auto;top:auto"><span>' + ic + '</span></div><h3>' + esc(who) + '</h3><p>' + label + '.</p>' +
      '<div class="row"><button class="btn" data-act="decline">Từ chối</button><button class="btn primary" data-act="accept">Đồng ý</button></div>', 'offer');
  }
  $('#modal').addEventListener('click', function (e) { if (e.target.id === 'modal' && !$('#modal').dataset.lock) closeModal(); });
  function confirmBox(title, text, okLabel, cb) {
    openModal('<h3>' + title + '</h3><p>' + text + '</p><div class="row"><button class="btn" data-act="modal-close">Huỷ</button><button class="btn primary" id="okBtn">' + okLabel + '</button></div>');
    $('#okBtn').onclick = function () { closeModal(); cb(); };
  }
  function endGameUI() {
    var r = S.result || {}, title, king;
    if (!r.winner) { title = 'Hoà cờ'; king = '<div class="piece big-piece r" style="left:auto;top:auto"><span>和</span></div>'; }
    else {
      title = S.myColor ? (r.winner === S.myColor ? 'Bạn thắng! 🎉' : 'Bạn thua rồi') : 'Quân ' + SIDE_NAME[r.winner] + ' thắng';
      king = '<div class="piece big-piece ' + r.winner + '" style="left:auto;top:auto"><span>' + CH[r.winner === 'r' ? 'K' : 'k'] + '</span></div>';
    }
    var why = REASON[r.reason] || '';
    if (r.winner && (r.reason === 'checkmate' || r.reason === 'stalemate' || r.reason === 'timeout' || r.reason === 'resign'))
      why = (r.reason === 'resign' ? 'Quân ' + SIDE_NAME[X.other(r.winner)] + ' xin thua' : why + ' – quân ' + SIDE_NAME[r.winner] + ' thắng');
    var canRematch = S.mode === 'ai' || !!S.myColor;
    openModal(king + '<h3>' + title + '</h3><p>' + why + ' · ' + S.moves.length + ' nước</p><div class="row"><button class="btn" data-act="modal-close">Xem lại bàn cờ</button>' +
      (canRematch ? '<button class="btn primary" data-act="modal-rematch">' + (S.mode === 'ai' ? 'Ván mới' : 'Chơi lại') + '</button>' : '') + '</div>');
    Sound.play(!r.winner ? 'notify' : (S.myColor && r.winner !== S.myColor) ? 'lose' : 'win');
    renderAll();
  }

  // ================= Chế độ chơi với máy =================
  var worker = null;
  function getWorker() {
    if (!worker) { worker = new Worker('/ai-worker.js'); worker.onmessage = onWorker; }
    return worker;
  }
  function resetWorker() { if (worker) { worker.terminate(); worker = null; } S.ai.thinking = false; }
  function onWorker(e) {
    var d = e.data; if (d.id !== S.ai.req || S.mode !== 'ai') return;
    if (d.kind === 'hint') {
      if (d.move) { S.hint = [d.move.from, d.move.to]; select(d.move.from); renderPieces(); }
      return;
    }
    var wait = Math.max(0, S.ai.minUntil - Date.now());
    setTimeout(function () {
      if (d.id !== S.ai.req || S.mode !== 'ai') return;
      S.ai.thinking = false;
      if (!d.move) return;
      var rec = S.game.move(d.move.from, d.move.to); if (!rec) return;
      var mv = { from: rec.from, to: rec.to, n: rec.notation, side: rec.side, cap: rec.captured, check: rec.check };
      S.moves.push(mv); soundFor(mv); if (mv.check) flashCheck();
      afterAIModeMove();
    }, wait);
  }
  function aiThink() {
    S.ai.thinking = true; S.ai.req++; S.ai.minUntil = Date.now() + 450;
    getWorker().postMessage({ id: S.ai.req, kind: 'move', fen: S.game.fen(), level: S.ai.level });
  }
  function aiHint() {
    if (!canMove()) return;
    S.ai.req++; toast('Đang tìm nước gợi ý…');
    getWorker().postMessage({ id: S.ai.req, kind: 'hint', fen: S.game.fen(), level: Math.max(3, Math.min(4, S.ai.level)) });
  }
  function afterAIModeMove() {
    var st = S.game.status();
    if (st.over) { S.status = 'over'; S.result = { winner: st.winner, reason: st.reason }; saveAI(); renderAll(); setTimeout(endGameUI, 500); return; }
    saveAI();
    if (S.game.turn !== S.myColor) aiThink();
    renderAll();
  }
  function aiUndo() {
    if (S.ai.thinking) resetWorker();
    S.ai.req++; S.hint = null;
    var g = S.game;
    while (g.history.length) { var rec = g.undo(); S.moves.pop(); if (rec.side === S.myColor) break; }
    S.status = 'playing'; S.result = null; S.selected = null; S.legal = [];
    saveAI(); renderAll(true);
    if (g.turn !== S.myColor) aiThink(), renderAll();
  }
  function saveAI() {
    store.set('ct_ai', JSON.stringify({ level: S.ai.level, human: S.myColor, moves: S.game.history.map(function (h) { return [h.from, h.to]; }), over: isOver(), result: S.result }));
  }
  function startAI(level, human, saved) {
    resetWorker(); leaveOnline();
    S.mode = 'ai'; S.ai.level = level; S.myColor = human; S.flipped = human === 'b';
    S.game = new X.Game(); S.moves = []; S.status = 'playing'; S.result = null; S.pending = null;
    S.clocks = null; S.running = null; S.selected = null; S.legal = []; S.hint = null;
    if (saved) saved.forEach(function (m) {
      var rec = S.game.move(m[0], m[1]);
      if (rec) S.moves.push({ from: rec.from, to: rec.to, n: rec.notation, side: rec.side, cap: rec.captured, check: rec.check });
    });
    showView('game'); renderGrid(); renderAll(true);
    if (history.state !== 'ai') history.pushState('ai', '', '/');
    var st = S.game.status();
    if (st.over) { S.status = 'over'; S.result = { winner: st.winner, reason: st.reason }; renderAll(); }
    else if (S.game.turn !== human) { aiThink(); renderAll(); }
    saveAI();
  }

  // ================= Kết nối mạng =================
  var Net = {
    ws: null, retry: 0, queue: [], ready: false,
    connect: function () {
      var self = this;
      var ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
      this.ws = ws; this.ready = false;
      ws.onopen = function () {
        self.retry = 0;
        ws.send(JSON.stringify({ type: 'hello', token: token, name: myName || defaultName() }));
        self.ready = true;
        if (S.mode === 'online' && S.roomId) ws.send(JSON.stringify({ type: 'join', roomId: S.roomId }));
        self.queue.splice(0).forEach(function (m) { ws.send(JSON.stringify(m)); });
        connBanner(false);
      };
      ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (er) { return; } onServer(m); };
      ws.onclose = function () {
        self.ready = false;
        if (S.mode === 'online') connBanner(true);
        setTimeout(function () { self.connect(); }, Math.min(8000, 600 * Math.pow(1.6, self.retry++)));
      };
    },
    send: function (m) { if (this.ready && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); else this.queue.push(m); }
  };
  function connBanner(show) { $('#conn').hidden = !show; }
  function defaultName() { return 'Kỳ thủ ' + token.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase(); }

  function onServer(m) {
    switch (m.type) {
      case 'created': S.roomId = m.roomId; history.pushState('room', '', '/r/' + m.roomId); store.set('ct_last_room', m.roomId); break;
      case 'state': applyRoom(m); break;
      case 'chat_history': $('#chatList').innerHTML = ''; setUnread(0); m.messages.forEach(function (x) { addChatMsg(x, true); }); break;
      case 'chat': addChatMsg(m.message); break;
      case 'toast': toast(m.text); Sound.play('notify'); break;
      case 'error':
        toast(m.text, true);
        if (m.code === 'no_room') { store.del('ct_last_room'); S.mode = null; S.roomId = null; showView('lobby'); history.replaceState(null, '', '/'); }
        break;
    }
  }

  function applyRoom(m) {
    var room = m.room, newGame = S.mode !== 'online' || room.id !== S.roomId || room.gameNo !== S.gameNo;
    var prevLen = newGame ? -1 : S.moves.length, prevStatus = S.status, prevPending = S.pending;
    var prevColor = S.myColor;
    S.mode = 'online'; S.roomId = room.id; S.gameNo = room.gameNo;
    S.myColor = m.you.color; S.seats = room.seats; S.spectators = room.spectators;
    S.status = room.status; S.result = room.result; S.pending = room.pending; S.timeControl = room.timeControl;
    S.clocks = room.timeControl ? room.clocks : null; S.running = room.running; S.clockAt = Date.now();
    var localBoardBefore = S.game.board.slice();
    S.game = new X.Game(room.fen); S.moves = room.moves;
    if (newGame || prevColor !== S.myColor) { S.flipped = S.myColor === 'b'; renderGrid(); }
    if (S.selected != null && (!canMove() || X.sideOf(S.game.board[S.selected]) !== S.myColor)) { S.selected = null; S.legal = []; }
    else if (S.selected != null) S.legal = S.game.movesFrom(S.selected);
    showView('game');
    store.set('ct_last_room', room.id);
    // âm thanh cho nước đi của đối thủ
    if (!newGame && room.moves.length === prevLen + 1 && !sameBoard(localBoardBefore, S.game.board)) {
      var mv = room.moves[room.moves.length - 1]; soundFor(mv); if (mv.check) flashCheck();
    }
    renderAll(newGame || (prevLen >= 0 && room.moves.length < prevLen));
    if (room.pending && S.myColor && room.pending.by !== S.myColor && (!prevPending || prevPending.type !== room.pending.type || prevPending.by !== room.pending.by)) { Sound.play('notify'); showOfferModal(room.pending); }
    if (!room.pending && $('#modal').dataset.kind === 'offer') closeModal();
    if (room.status === 'over' && prevStatus !== 'over' && !newGame) setTimeout(endGameUI, 450);
    if (newGame && room.gameNo > 1 && prevStatus === 'over') closeModal();
  }

  // ---------- Chat + thông báo tin nhắn mới ----------
  var unread = 0, chatToastTimer = null, chatToastHideTimer = null, chatToastExtra = 0;
  function chatTabActive() { return !$('#game').hidden && !$('[data-body="chat"]').hidden; }
  function onScreen(el, pad) {
    if (!el) return false; var r = el.getBoundingClientRect(); pad = pad || 0;
    return r.height > 0 && r.bottom > pad && r.top < innerHeight - pad && r.right > 0 && r.left < innerWidth;
  }
  // Người chơi đang thực sự nhìn thấy khung chat?
  function chatVisible() { return !document.hidden && S.mode === 'online' && chatTabActive() && onScreen($('#chatList'), 40); }
  function setUnread(n) {
    unread = Math.max(0, n);
    var t = unread > 99 ? '99+' : String(unread);
    ['#chatBadge', '#fabBadge'].forEach(function (sel) { var b = $(sel); b.hidden = !unread; b.textContent = t; });
    $('#chatTab').setAttribute('aria-label', 'Trò chuyện' + (unread ? ' – ' + unread + ' tin nhắn chưa đọc' : ''));
    updateTitle(); updateFab();
  }
  function markReadIfVisible() { if (unread && chatVisible()) setUnread(0); }
  function truncate(s, n) { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }

  function addChatMsg(x, silent) {
    var el = document.createElement('div');
    el.className = 'msg' + (x.mine ? ' me' : '');
    el.innerHTML = '<b class="' + (x.color || '') + '">' + esc(x.name) + (x.color ? ' · ' + SIDE_NAME[x.color] : ' · khán giả') + '</b>' + esc(x.text);
    var list = $('#chatList'); list.appendChild(el); list.scrollTop = list.scrollHeight;
    // Không báo cho tin của chính mình, tin hệ thống hoặc lịch sử khi vào phòng
    if (silent || x.mine || x.system || !x.name) return;
    if (chatVisible()) return;
    setUnread(unread + 1);
    showChatToast(x);
    Sound.play('chat');
    try { if (navigator.vibrate) navigator.vibrate(50); } catch (e) { }
  }

  function showChatToast(x) {
    var el = $('#chatToast'), wasShown = el.classList.contains('in');
    chatToastExtra = wasShown ? chatToastExtra + 1 : 0;
    var av = $('#ctAvatar');
    av.className = 'avatar ' + (x.color || 'spec');
    av.textContent = x.color ? CH[x.color === 'r' ? 'K' : 'k'] : '觀';
    $('#ctName').textContent = x.name + (x.color ? ' · ' + SIDE_NAME[x.color] : ' · khán giả');
    $('#ctMsg').textContent = truncate(x.text, 60);
    var cnt = $('#ctCount'); cnt.hidden = !chatToastExtra; cnt.textContent = '+' + chatToastExtra;
    // đặt sát mép trên bàn cờ (nếu bàn cờ đang ở trên màn hình), luôn trong viewport
    var b = $('#board').getBoundingClientRect(), top = 0;
    if (b.bottom > 80 && b.top < innerHeight) top = Math.min(Math.max(b.top + 10, 0), innerHeight - 110);
    el.style.setProperty('--toast-top', top + 'px');
    clearTimeout(chatToastTimer); clearTimeout(chatToastHideTimer);
    el.hidden = false; el.classList.remove('out'); void el.offsetWidth; el.classList.add('in');
    chatToastTimer = setTimeout(hideChatToast, 4000);
  }
  function hideChatToast() {
    var el = $('#chatToast'); clearTimeout(chatToastTimer);
    if (el.hidden) return;
    el.classList.remove('in'); el.classList.add('out');
    chatToastHideTimer = setTimeout(function () { el.hidden = true; el.classList.remove('out'); chatToastExtra = 0; }, 260);
  }
  function openChat() {
    hideChatToast();
    $('#chatTab').click();
    var panel = document.querySelector('.tabs-panel');
    if (!onScreen($('#chatList'), 40)) panel.scrollIntoView({ behavior: 'smooth', block: 'end' });
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // không bật bàn phím
  }
  $('#chatToastBtn').addEventListener('click', openChat);
  $('#chatToastClose').addEventListener('click', function (e) { e.stopPropagation(); hideChatToast(); });
  $('#chatFab').addEventListener('click', openChat);

  // Nút chat nổi (điện thoại): chỉ hiện khi khung chat không trên màn hình và không đè lên bàn cờ
  var mqStacked = window.matchMedia('(max-width: 1020px)');
  function updateFab() {
    var fab = $('#chatFab'); if (!fab || !mqStacked) return;
    var want = S.mode === 'online' && !$('#game').hidden && mqStacked.matches && !onScreen(document.querySelector('.tabs-panel'), 60);
    if (want) {
      var f = fab.getBoundingClientRect(), b = $('#board').getBoundingClientRect(), m = 6;
      if (f.width && f.left < b.right + m && f.right > b.left - m && f.top < b.bottom + m && f.bottom > b.top - m) want = false;
    }
    fab.classList.toggle('show', want);
    fab.setAttribute('aria-hidden', want ? 'false' : 'true'); fab.tabIndex = want ? 0 : -1;
  }
  var scrollRaf = 0;
  function onViewportChange() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(function () { scrollRaf = 0; markReadIfVisible(); updateFab(); });
  }
  window.addEventListener('scroll', onViewportChange, { passive: true });
  window.addEventListener('resize', onViewportChange);
  document.addEventListener('visibilitychange', function () { markReadIfVisible(); updateTitle(); });

  $('#chatForm').addEventListener('submit', function (e) {
    e.preventDefault(); var v = $('#chatInput').value.trim(); if (!v) return;
    if (S.mode !== 'online') { toast('Trò chuyện chỉ dùng khi chơi online'); return; }
    Net.send({ type: 'chat', text: v }); $('#chatInput').value = '';
  });
  document.querySelectorAll('.tab').forEach(function (t) {
    t.onclick = function () {
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('on', x === t); });
      document.querySelectorAll('.tab-body').forEach(function (b) { b.hidden = b.dataset.body !== t.dataset.tab; });
      if (t.dataset.tab === 'chat') { setUnread(0); hideChatToast(); var l = $('#chatList'); l.scrollTop = l.scrollHeight; }
      updateFab();
    };
  });
  $('#chatFab').insertAdjacentHTML('afterbegin', icon('chat'));
  document.querySelector('[data-icon="send"]').innerHTML = icon('send');

  // ================= Điều hướng =================
  var currentView = null;
  function showView(v) {
    if (v !== currentView) { window.scrollTo(0, 0); currentView = v; }
    $('#lobby').hidden = v !== 'lobby'; $('#game').hidden = v !== 'game';
    $('#chatTab').hidden = S.mode !== 'online';
    if (S.mode !== 'online') { document.querySelector('.tab[data-tab="moves"]').click(); }
    if (v === 'lobby') { renderResume(); baseTitle = 'Cờ Tướng Online'; setUnread(0); hideChatToast(); connBanner(false); }
    updateFab();
  }
  function leaveOnline() { if (S.mode === 'online') { Net.send({ type: 'leave' }); S.roomId = null; S.gameNo = 0; } }
  function leaveGame() {
    if (S.mode === 'ai') resetWorker();
    leaveOnline(); S.mode = null; S.myColor = null; closeModal();
    history.pushState(null, '', '/'); showView('lobby');
  }
  function joinRoomById(id) {
    id = String(id).trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(id)) { toast('Mã phòng không hợp lệ', true); return; }
    if (S.mode === 'ai') resetWorker();
    S.mode = 'online'; S.roomId = id; S.gameNo = 0; S.moves = []; S.game = new X.Game(); prevBoard = null;
    $('#chatList').innerHTML = '';
    if (location.pathname !== '/r/' + id) history.pushState('room', '', '/r/' + id);
    Net.send({ type: 'join', roomId: id });
  }
  function askNameThen(cb) {
    if (myName) return cb();
    openModal('<div class="piece big-piece r" style="left:auto;top:auto"><span>帥</span></div><h3>Bạn tên gì?</h3><p>Tên sẽ hiển thị với đối thủ trong phòng.</p>' +
      '<input id="modalName" maxlength="24" value="' + esc(defaultName()) + '"><div class="row"><button class="btn primary" id="nameOk">Vào phòng</button></div>');
    $('#modal').dataset.lock = '1';
    var inp = $('#modalName'); inp.focus(); inp.select();
    var go = function () { setName(inp.value.trim() || defaultName()); delete $('#modal').dataset.lock; closeModal(); cb(); };
    $('#nameOk').onclick = go; inp.onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }
  function setName(n) {
    myName = n.slice(0, 24); store.set('ct_name', myName); $('#nameInput').value = myName;
    Net.send({ type: 'hello', token: token, name: myName });
  }
  function route() {
    var m = location.pathname.match(/^\/r\/([A-Za-z0-9]+)/);
    if (m) askNameThen(function () { joinRoomById(m[1]); });
    else { if (S.mode) { if (S.mode === 'ai') resetWorker(); leaveOnline(); S.mode = null; } showView('lobby'); }
  }
  window.addEventListener('popstate', route);

  // ---------- Sảnh ----------
  function segVal(id) { var b = document.querySelector('#' + id + ' .on'); return b && b.dataset.v; }
  document.querySelectorAll('.seg').forEach(function (seg) {
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
    });
  });
  $('#nameInput').value = myName;
  $('#nameInput').addEventListener('change', function () { setName(this.value.trim() || defaultName()); });
  function ensureName() { var v = $('#nameInput').value.trim(); if (v !== myName || !myName) setName(v || defaultName()); }
  $('#createBtn').onclick = function () {
    Sound.init(); ensureName();
    if (S.mode === 'ai') resetWorker();
    S.mode = 'online'; S.roomId = null; S.gameNo = 0; S.moves = []; prevBoard = null; $('#chatList').innerHTML = '';
    Net.send({ type: 'create', minutes: +segVal('tcSeg'), increment: +segVal('incSeg'), color: segVal('colorSeg') });
  };
  $('#joinForm').addEventListener('submit', function (e) { e.preventDefault(); Sound.init(); ensureName(); joinRoomById($('#codeInput').value); });
  $('#aiBtn').onclick = function () { Sound.init(); ensureName(); startAI(+segVal('levelSeg'), segVal('aiColorSeg')); };
  function renderResume() {
    var box = $('#resumeBox'), h = '', saved = null;
    try { saved = JSON.parse(store.get('ct_ai', 'null')); } catch (e) { }
    if (saved && !saved.over && saved.moves && saved.moves.length)
      h += '<div class="resume"><div>Bạn có một ván với máy đang dở · <b>cấp ' + LEVEL_NAMES[saved.level] + '</b> · ' + saved.moves.length + ' nước</div><button class="btn primary" id="resumeAI">Chơi tiếp</button></div>';
    var last = store.get('ct_last_room', '');
    if (last) h += '<div class="resume"><div>Phòng gần nhất: <b>' + esc(last) + '</b></div><button class="btn" id="resumeRoom">Quay lại phòng</button></div>';
    box.innerHTML = h; box.hidden = !h;
    if ($('#resumeAI')) $('#resumeAI').onclick = function () { startAI(saved.level, saved.human, saved.moves); };
    if ($('#resumeRoom')) $('#resumeRoom').onclick = function () { joinRoomById(last); };
  }

  // ---------- Khởi động ----------
  renderGrid();
  Net.connect();
  route();
  window.__ct = S; // tiện cho kiểm thử
})();
