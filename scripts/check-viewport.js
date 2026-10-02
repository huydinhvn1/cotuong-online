// Chạy: npm i --no-save playwright-core && npx playwright install chromium && ONLINE=http://localhost:3000 node scripts/check-viewport.js
// Kiểm tra bàn cờ vừa màn hình: scrollWidth <= innerWidth, bàn cờ + quân + panel nằm trong viewport
const { chromium } = require('playwright-core');
const ONLINE = process.env.ONLINE || 'http://localhost:3000';
const OFFLINE = 'file://' + require('path').resolve(__dirname, '../offline/index.html');
const SIZES = [[320, 568], [375, 667], [390, 844], [430, 932]];
const OUT_ON = (process.env.OUT || '/tmp/') , OUT_OFF = OUT_ON; require('fs').mkdirSync(OUT_ON, { recursive: true });
const only = process.argv[2];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  let fails = 0, checks = 0; const errors = [];
  async function measure(p) {
    return p.evaluate(() => {
      const W = innerWidth, H = innerHeight, bad = [];
      const rect = e => e.getBoundingClientRect();
      const b = rect(document.querySelector('#board'));
      if (b.left < -0.5 || b.right > W + 0.5 || b.top < -0.5 || b.bottom > H + 0.5) bad.push('board ' + [b.left, b.top, b.right, b.bottom].map(Math.round));
      document.querySelectorAll('#pieces .piece').forEach(el => { const r = rect(el); if (r.left < -0.5 || r.right > W + 0.5) bad.push('piece ' + Math.round(r.left) + '-' + Math.round(r.right)); });
      document.querySelectorAll('.player-bar, .panel, .topbar, .controls .btn, .share-row .btn').forEach(el => { const r = rect(el); if (r.width && (r.left < -0.5 || r.right > W + 0.5)) bad.push((el.className || el.tagName).split(' ')[0] + ' ' + Math.round(r.left) + '-' + Math.round(r.right)); });
      const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      if (sw > W) bad.push('scrollWidth ' + sw + ' > ' + W);
      return { W, H, sw, board: [Math.round(b.width), Math.round(b.height)], bad: bad.slice(0, 6) };
    });
  }
  async function check(tag, p, shot) {
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(250);
    const m = await measure(p); checks++;
    const ok = !m.bad.length; if (!ok) fails++;
    console.log((ok ? 'PASS ' : 'FAIL ') + tag.padEnd(34) + ` vp ${m.W}x${m.H} scrollW ${m.sw} board ${m.board.join('x')}` + (ok ? '' : '  ' + m.bad.join(' | ')));
    if (shot) await p.screenshot({ path: shot });
  }
  const orientations = [];
  for (const [w, h] of SIZES) { orientations.push([w, h, 'doc']); orientations.push([h, w, 'ngang']); }
  for (const [w, h, o] of orientations) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    const tag = `${w}x${h}-${o}`;
    if (only !== 'offline') {
      // Phòng online (link mời dài) – tên dài để thử cắt chữ
      await p.goto(ONLINE, { timeout: 30000 }); await p.waitForTimeout(700);
      await p.fill('#nameInput', 'Nguyễn Văn Huy Đinh Dài'); await p.click('#createBtn');
      await p.waitForURL(/\/r\//, { timeout: 20000 }); await p.waitForSelector('.share-row .link'); await p.waitForTimeout(500);
      await check('online phòng ' + tag, p, OUT_ON + `phong-${tag}.png`);
      await p.click('[data-act="leave"]'); await p.waitForTimeout(300);
      await p.click('#aiBtn'); await p.waitForTimeout(700);
      await check('online với máy ' + tag, p, OUT_ON + `voi-may-${tag}.png`);
      await p.click('[data-act="leave"]');
    }
    if (only !== 'online') {
      await p.goto(OFFLINE); await p.waitForTimeout(500);
      await p.click('#aiBtn'); await p.waitForTimeout(600);
      await check('offline với máy ' + tag, p, OUT_OFF + `voi-may-${tag}.png`);
      await p.click('[data-act="leave"]'); await p.waitForTimeout(200);
      await p.click('#localBtn'); await p.waitForTimeout(500);
      await check('offline hai người ' + tag, p, OUT_OFF + `hai-nguoi-${tag}.png`);
      await p.click('[data-act="leave"]');
    }
    await ctx.close();
  }
  console.log(`\n${checks - fails}/${checks} passed; page errors: ${errors.length ? errors : 'none'}`);
  await browser.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
