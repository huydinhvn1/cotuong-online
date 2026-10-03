// Kiểm thử trình duyệt (Chromium + WebKit) cho thông báo tin nhắn mới: 2 người chơi + 1 khán giả, màn hình 430x932.
// Người nhận thấy toast + huy hiệu, người gửi thì không; chạm toast mở tab Trò chuyện, xoá huy hiệu, không bật bàn phím;
// tab ẩn -> tiêu đề "(N) Tin nhắn mới – Cờ Tướng".
// Chạy: npm i --no-save playwright-core && npx playwright-core install chromium webkit && node scripts/check-chat-notify.js
// Biến môi trường: ENGINES=chromium,webkit, CHROME=đường dẫn Chrome, SHOT=đường dẫn ảnh, PORT (mặc định 3998)
const pw = require(process.env.PW || 'playwright-core');
const path = require('path');
const { spawn } = require('child_process');
const PORT = process.env.PORT || 3998, URL = `http://localhost:${PORT}`;
const ENGINES = (process.env.ENGINES || 'chromium,webkit').split(',');
const SHOT = process.env.SHOT || '/tmp/cotuong-chat-toast-430x932.png';
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + msg); }

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT } });
  await new Promise((r, j) => { srv.stdout.on('data', d => /đang chạy/.test(d) && r()); srv.on('exit', () => j(new Error('server exited'))); });
  const pageErrors = [];
  try {
    for (const eng of ENGINES) {
      const browser = await pw[eng].launch(eng === 'chromium' ? { executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] } : {});
      const mk = async (tag) => {
        const ctx = await browser.newContext({ locale: 'vi-VN', viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
        await ctx.addInitScript(() => { window.__vib = []; navigator.vibrate = function (x) { window.__vib.push(x); return true; }; });
        const p = await ctx.newPage(); p.on('pageerror', e => pageErrors.push(eng + ' ' + tag + ': ' + e.message)); return p;
      };
      const ui = p => p.evaluate(() => {
        const t = document.querySelector('#chatToast'), r = t.getBoundingClientRect(), b = document.querySelector('#board').getBoundingClientRect();
        const fab = document.querySelector('#chatFab'), fr = fab.getBoundingClientRect();
        return {
          toast: !t.hidden && t.classList.contains('in'), toastRect: [r.left, r.top, r.right, r.bottom].map(Math.round),
          name: document.querySelector('#ctName').textContent, msg: document.querySelector('#ctMsg').textContent, count: document.querySelector('#ctCount').hidden ? '' : document.querySelector('#ctCount').textContent,
          badge: document.querySelector('#chatBadge').hidden ? '' : document.querySelector('#chatBadge').textContent,
          fabBadge: document.querySelector('#fabBadge').hidden ? '' : document.querySelector('#fabBadge').textContent,
          fab: fab.classList.contains('show'), fabOverBoard: fr.left < b.right && fr.right > b.left && fr.top < b.bottom && fr.bottom > b.top,
          chatOn: !document.querySelector('[data-body="chat"]').hidden, active: document.activeElement && document.activeElement.tagName,
          title: document.title, vib: window.__vib.slice(), W: innerWidth, H: innerHeight,
        };
      });
      const A = await mk('A'), B = await mk('B'), C = await mk('C');
      await A.goto(URL); await A.fill('#nameInput', 'Huy'); await A.click('#colorSeg [data-v="r"]'); await A.click('#createBtn');
      await A.waitForURL(/\/r\//);
      await B.goto(A.url()); await B.waitForSelector('#modalName'); await B.fill('#modalName', 'Lan'); await B.click('#nameOk');
      await A.waitForFunction(() => window.__ct.status === 'playing');
      await C.goto(A.url()); await C.waitForSelector('#modalName'); await C.fill('#modalName', 'Khán giả Minh'); await C.click('#nameOk');
      await C.waitForFunction(() => window.__ct.status === 'playing');
      await A.waitForTimeout(400);

      // B đang ở tab "Nước đi"; A gửi tin dài từ tab Trò chuyện
      const long = 'Chào bạn nhé, ván này mình chơi chậm thôi để còn suy nghĩ kỹ từng nước đi, đừng vội!';
      await A.click('#chatTab'); await A.fill('#chatInput', long); await A.press('#chatInput', 'Enter');
      await B.waitForFunction(() => document.querySelector('#chatList').textContent.includes('Chào bạn'));
      await B.waitForTimeout(350);
      let b = await ui(B), a = await ui(A);
      ok(b.toast, `${eng}: người nhận thấy toast`);
      ok(b.name.startsWith('Huy') && b.msg.length <= 60 && b.msg.endsWith('…'), `${eng}: toast có tên + tin rút gọn (${b.msg.length} ký tự): "${b.name}" / "${b.msg}"`);
      ok(b.toastRect[0] >= 0 && b.toastRect[2] <= b.W && b.toastRect[1] >= 0 && b.toastRect[3] <= b.H, `${eng}: toast nằm trong viewport ${b.toastRect}`);
      ok(b.badge === '1' && b.fabBadge === '1', `${eng}: huy hiệu tab + nút nổi = 1 (${b.badge}/${b.fabBadge})`);
      ok(!b.fab || !b.fabOverBoard, `${eng}: nút chat nổi không đè bàn cờ (show=${b.fab})`);
      ok(b.vib.length === 1 && b.vib[0] === 50, `${eng}: rung 50ms (${JSON.stringify(b.vib)})`);
      ok(!a.toast && a.badge === '' && a.fabBadge === '' && a.vib.length === 0, `${eng}: người gửi không có toast/huy hiệu/rung`);
      if (eng === ENGINES[0]) { await B.screenshot({ path: SHOT }); console.log('     ảnh: ' + SHOT); }

      // Khán giả nhắn -> cũng tính
      await C.click('#chatTab'); await C.fill('#chatInput', 'Hay quá!'); await C.press('#chatInput', 'Enter');
      await B.waitForFunction(() => document.querySelector('#chatList').textContent.includes('Hay quá'));
      await B.waitForTimeout(300);
      b = await ui(B); const c = await ui(C);
      ok(b.toast && b.badge === '2' && b.count === '+1' && /khán giả/.test(b.name) && b.msg === 'Hay quá!', `${eng}: tin khán giả cũng báo (badge ${b.badge}, ${b.count}, "${b.name}")`);
      ok(!c.toast && c.badge === '', `${eng}: khán giả (người gửi) không bị báo`);

      // Toast tự ẩn sau ~4s
      await B.waitForTimeout(4400);
      b = await ui(B); ok(!b.toast && b.badge === '2', `${eng}: toast tự ẩn sau ~4s, huy hiệu vẫn còn`);

      // Tin mới -> chạm toast -> mở tab chat, xoá huy hiệu, không focus ô nhập
      await A.fill('#chatInput', 'Đi đi bạn'); await A.press('#chatInput', 'Enter');
      await B.waitForFunction(() => document.querySelector('#chatToast').classList.contains('in'));
      await B.waitForTimeout(300);
      await B.locator('#chatToastBtn').tap();
      await B.waitForTimeout(900);
      b = await ui(B);
      const listOn = await B.evaluate(() => { const r = document.querySelector('#chatList').getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
      ok(b.chatOn && listOn && b.badge === '' && b.fabBadge === '' && !b.toast, `${eng}: chạm toast -> tab Trò chuyện hiện trên màn hình, huy hiệu xoá`);
      ok(b.active !== 'INPUT' && b.active !== 'TEXTAREA', `${eng}: không focus ô nhập (activeElement=${b.active})`);

      // Đang ở tab chat nhưng khung chat cuộn khuất (điện thoại) -> vẫn báo
      await B.evaluate(() => scrollTo(0, 0)); await B.waitForTimeout(300);
      const hiddenByScroll = await B.evaluate(() => { const r = document.querySelector('#chatList').getBoundingClientRect(); return r.top > innerHeight - 40 || r.bottom < 40; });
      if (hiddenByScroll) {
        await A.fill('#chatInput', 'Bạn còn đó không?'); await A.press('#chatInput', 'Enter');
        await B.waitForFunction(() => document.querySelector('#chatList').textContent.includes('còn đó'));
        await B.waitForTimeout(300); b = await ui(B);
        ok(b.toast && b.badge === '1', `${eng}: khung chat cuộn khuất -> vẫn báo`);
        await B.locator('#chatToastBtn').tap(); await B.waitForTimeout(900); b = await ui(B);
        ok(b.badge === '' && b.active !== 'INPUT', `${eng}: chạm toast cuộn tới khung chat`);
      } else console.log(`     (${eng}: khung chat vẫn trên màn hình khi ở đầu trang – bỏ qua kiểm tra cuộn khuất)`);

      // Đang xem khung chat -> không báo
      b = await ui(B); const vib0 = b.vib.length;
      await A.fill('#chatInput', 'ok'); await A.press('#chatInput', 'Enter');
      await B.waitForFunction(() => [...document.querySelectorAll('#chatList .msg')].pop().textContent.endsWith('ok'));
      await B.waitForTimeout(300); b = await ui(B);
      ok(!b.toast && b.badge === '' && b.vib.length === vib0, `${eng}: đang xem chat -> không báo`);

      // Tab trình duyệt ẩn -> tiêu đề "(N) Tin nhắn mới – Cờ Tướng", hiện lại -> khôi phục
      await B.evaluate(() => { window.__hid = true; Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hid }); document.dispatchEvent(new Event('visibilitychange')); });
      const t0 = (await ui(B)).title;
      await A.waitForTimeout(600); // server giới hạn 1 tin / 400ms mỗi người
      await A.fill('#chatInput', 'Tới lượt bạn'); await A.press('#chatInput', 'Enter');
      await C.fill('#chatInput', 'Cố lên'); await C.press('#chatInput', 'Enter');
      await B.waitForFunction(() => document.title.startsWith('(2)'), null, { timeout: 5000 }).catch(() => { });
      b = await ui(B);
      if (b.title !== '(2) Tin nhắn mới – Cờ Tướng') console.log('     debug:', await B.evaluate(() => [...document.querySelectorAll('#chatList .msg')].slice(-3).map(e => e.textContent)), await C.evaluate(() => [document.querySelector('#chatInput').value, document.querySelector('#chatInput').disabled]));
      ok(b.title === '(2) Tin nhắn mới – Cờ Tướng', `${eng}: tab ẩn -> tiêu đề "${b.title}"`);
      await B.evaluate(() => { window.__hid = false; document.dispatchEvent(new Event('visibilitychange')); });
      await B.waitForTimeout(200); b = await ui(B);
      ok(b.title === t0 && b.badge === '', `${eng}: hiện lại -> tiêu đề khôi phục "${b.title}", huy hiệu xoá (đang ở tab chat)`);

      // Ô nhập >= 16px
      const small = await B.evaluate(() => [...document.querySelectorAll('input,textarea,select')].filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.id));
      ok(!small.length, `${eng}: mọi ô nhập >= 16px ${small.join(',')}`);
      await browser.close();
    }
  } finally { srv.kill(); }
  ok(!pageErrors.length, 'không lỗi JS trên trang ' + pageErrors.join('; '));
  console.log(`\n${checks - fails}/${checks} passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
