// Kiểm tra bố cục di động (Chromium + WebKit): không cuộn ngang, quân nằm trong khung gỗ, logo/thanh người chơi không bị cắt, ô nhập >= 16px.
// Chạy: npm start (cổng 3000) rồi
//   npm i --no-save playwright-core && npx playwright-core install chromium webkit && node scripts/check-viewport.js
// Biến môi trường: ONLINE (mặc định http://localhost:3000), ENGINES=chromium,webkit, SIZES=390x844,430x932,..., OUT=thư mục ảnh
const pw = require('playwright-core');
const ONLINE = process.env.ONLINE || 'http://localhost:3000';
const OFFLINE = 'file://' + require('path').resolve(__dirname, '../offline/index.html');
const OUT_ON = (process.env.OUT || '/tmp/cotuong-viewport') + '/', OUT_OFF = OUT_ON; require('fs').mkdirSync(OUT_ON, { recursive: true });
const SIZES = (process.env.SIZES || '390x844,430x932,402x874,320x568,375x667,932x430,844x390').split(',').map(s => s.split('x').map(Number));
const ENGINES = (process.env.ENGINES || 'chromium,webkit').split(',');
(async () => {
  let checks = 0, fails = 0; const pageErrors = [];
  async function measure(p) {
    return p.evaluate(() => {
      const W = innerWidth, H = innerHeight, bad = [], R = e => e.getBoundingClientRect();
      // tắt lưới an toàn để phát hiện tràn thật
      const st = document.createElement('style'); st.textContent = 'html,body{overflow-x:visible!important}'; document.head.appendChild(st);
      const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      if (sw > W) {
        bad.push('scrollWidth ' + sw + '>' + W);
        const off = [...document.querySelectorAll('body *')].filter(e => { const r = R(e); return r.width && r.right > W + 0.5 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 3);
        off.forEach(e => bad.push('wide: ' + e.tagName + '.' + e.className + ' ' + Math.round(R(e).right)));
      }
      st.remove();
      const board = document.querySelector('#board');
      if (board && board.offsetParent) {
        const b = R(board), bw = b.width * 0.0115; // viền gỗ trong
        const fr = { l: b.left + bw, t: b.top + bw, r: b.right - bw, b: b.bottom - bw };
        if (b.left < 7.5 || b.right > W - 7.5) bad.push('board side padding ' + Math.round(b.left) + '/' + Math.round(W - b.right));
        if (b.height > H || b.top + scrollY < 0 || (scrollY === 0 && b.bottom > H)) bad.push('board does not fit vertically ' + Math.round(b.top) + '-' + Math.round(b.bottom));
        let worst = 1e9;
        document.querySelectorAll('#pieces .piece:not(.captured-out)').forEach(el => {
          const r = R(el); worst = Math.min(worst, r.left - fr.l, fr.r - r.right, r.top - fr.t, fr.b - r.bottom);
          if (r.left < fr.l - 0.5 || r.right > fr.r + 0.5 || r.top < fr.t - 0.5 || r.bottom > fr.b + 0.5) bad.push('piece outside frame ' + el.textContent + ' ' + [r.left, r.right].map(Math.round));
          if (r.left < 0 || r.right > W) bad.push('piece outside viewport');
        });
        var pieceGap = Math.round(worst * 10) / 10;
      }
      const logo = document.querySelector('.brand-mark').getBoundingClientRect();
      if (logo.left < 0) bad.push('logo left ' + logo.left);
      document.querySelectorAll('.avatar, .player-bar, .panel, .topbar, .btn, .clock').forEach(el => { const r = R(el); if (r.width && el.offsetParent && (r.left < 0 || r.right > W + 0.5)) bad.push('out: ' + el.className.split(' ')[0] + ' ' + Math.round(r.left) + '-' + Math.round(r.right)); });
      document.querySelectorAll('input, textarea, select').forEach(el => { const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 16) bad.push('input font ' + fs + 'px #' + el.id); });
      const vv = window.visualViewport; if (vv && Math.abs(vv.scale - 1) > 0.001) bad.push('zoom scale ' + vv.scale);
      return { W, H, sw, board: board && board.offsetParent ? Math.round(R(board).width) : 0, pieceGap, logoLeft: Math.round(logo.left), bad: [...new Set(bad)].slice(0, 6) };
    });
  }
  async function check(tag, p, shot) {
    const m = await measure(p); checks++; const ok = !m.bad.length; if (!ok) fails++;
    console.log((ok ? 'PASS ' : 'FAIL ') + tag.padEnd(46) + ` sw ${m.sw}/${m.W} board ${m.board}px gap ${m.pieceGap}px logo ${m.logoLeft}` + (ok ? '' : '  ⟶ ' + m.bad.join(' | ')));
    if (shot) await p.screenshot({ path: shot });
  }
  const clickSq = async (p, sq) => {
    const g = await p.evaluate(() => window.__geo), f = await p.evaluate(() => window.__ct.flipped), box = await p.locator('#board').boundingBox();
    let r = Math.floor(sq / 9), c = sq % 9; if (f) { r = 9 - r; c = 8 - c; }
    await p.mouse.click(box.x + box.width * (g.M + c * 100) / g.W, box.y + box.height * (g.M + r * 100) / g.H);
  };
  for (const eng of ENGINES) {
    const browser = await pw[eng].launch(eng === 'chromium' ? { executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] } : {});
    for (const [w, h] of SIZES) {
      const tag = `${eng} ${w}x${h}`, file = `${eng}-${w}x${h}`;
      const mk = () => browser.newContext({ locale: 'vi-VN', viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      const ctx = await mk(), p = await ctx.newPage(); p.on('pageerror', e => pageErrors.push(tag + ': ' + e.message));
      // ---- Phòng online: 2 người, link mời dài, chat ----
      await p.goto(ONLINE, { timeout: 45000 }); await p.waitForTimeout(600);
      await p.fill('#nameInput', 'Nguyễn Văn Huy Đinh Dài'); await p.click('#colorSeg [data-v="r"]'); await p.click('#createBtn');
      await p.waitForURL(/\/r\//, { timeout: 20000 });
      const ctx2 = await mk(), p2 = await ctx2.newPage();
      await p2.goto(p.url()); await p2.waitForSelector('#modalName'); await p2.fill('#modalName', 'Đối thủ có cái tên rất dài'); await p2.click('#nameOk');
      await p.waitForFunction(() => window.__ct.status === 'playing', null, { timeout: 15000 });
      await clickSq(p, 64); await p.waitForTimeout(150); await clickSq(p, 67);  // P2-5
      await p.waitForFunction(() => window.__ct.moves.length === 1);
      await clickSq(p2, 0); await p2.waitForTimeout(150); await clickSq(p2, 9); // X1.1 (xe đen ở mép)
      await p.waitForFunction(() => window.__ct.moves.length === 2); await p.waitForTimeout(500);
      await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(200);
      await check('online phòng ' + tag, p, OUT_ON + `phong-${file}.png`);
      // chat: focus ô nhập + tin nhắn dài không dấu cách
      await p.click('#chatTab'); await p.click('#chatInput'); await p.waitForTimeout(300);
      await p.fill('#chatInput', 'https://cotuong-online-6qpn.onrender.com/r/UERHGU?xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'); await p.press('#chatInput', 'Enter');
      await p.waitForTimeout(400); await p.click('#chatInput'); await p.waitForTimeout(300);
      await check('online phòng + focus chat ' + tag, p, OUT_ON + `phong-chat-${file}.png`);
      // hộp thoại lời mời (đối thủ xin hoà)
      await p2.click('[data-act="draw"]'); await p.waitForSelector('#modal:not([hidden])'); await p.waitForTimeout(300);
      await check('online hộp thoại cầu hoà ' + tag, p);
      await p.click('#modal [data-act="decline"]'); await p.waitForTimeout(200);
      await ctx2.close();
      // ---- Với máy (online app) ----
      await p.click('.tab[data-tab="moves"]'); await p.click('[data-act="leave"]'); await p.waitForTimeout(300);
      await p.click('#aiBtn'); await p.waitForTimeout(700);
      await check('online với máy ' + tag, p, OUT_ON + `voi-may-${file}.png`);
      await p.click('[data-act="leave"]'); await p.waitForTimeout(200);
      await check('online sảnh ' + tag, p);
      // ---- Offline ----
      await p.goto(OFFLINE); await p.waitForTimeout(400);
      await check('offline sảnh ' + tag, p);
      await p.click('#aiBtn'); await p.waitForTimeout(600);
      await check('offline với máy ' + tag, p, OUT_OFF + `voi-may-${file}.png`);
      await p.click('[data-act="leave"]'); await p.waitForTimeout(200);
      await p.click('#localBtn'); await p.waitForTimeout(500);
      await check('offline hai người ' + tag, p, OUT_OFF + `hai-nguoi-${file}.png`);
      await p.click('[data-act="leave"]');
      await ctx.close();
    }
    await browser.close();
  }
  console.log(`\n${checks - fails}/${checks} passed · page errors: ${pageErrors.length ? pageErrors.join('; ') : 'none'}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
