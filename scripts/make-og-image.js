// Tạo ảnh xem trước khi chia sẻ public/og-image.png (1200×630) + public/apple-touch-icon.png (180×180) từ scripts/og/og-image.html.
// Cần playwright-core + Chrome: PW=/đường/dẫn/playwright-core CHROME=/usr/bin/google-chrome node scripts/make-og-image.js
const path = require('path');
const { chromium } = require(process.env.PW || 'playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(__dirname, 'og', 'og-image.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(__dirname, '..', 'public', 'og-image.png'), type: 'png' });
  // biểu tượng màn hình chính (iOS): quân 帥
  const q = await b.newPage({ viewport: { width: 180, height: 180 } });
  await q.setContent(`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@700&text=%E5%B8%A5&display=block">
    <style>html,body{margin:0;width:180px;height:180px;background:#1a1310;display:grid;place-items:center}
    div{width:150px;height:150px;border-radius:50%;display:grid;place-items:center;font:700 86px 'LXGW WenKai TC',serif;color:#b8221b;
    background:radial-gradient(circle at 35% 30%,#fffaf0,#f2ddb2 55%,#d6ad6c);box-shadow:0 5px 0 #9b6a36,inset 0 0 0 9px #f6e6c4,inset 0 0 0 12px #b8221b}</style><div>帥</div>`, { waitUntil: 'networkidle' });
  await q.evaluate(() => document.fonts.ready);
  await q.screenshot({ path: path.join(__dirname, '..', 'public', 'apple-touch-icon.png'), type: 'png' });
  await b.close();
  console.log('đã tạo public/og-image.png + public/apple-touch-icon.png');
})();
