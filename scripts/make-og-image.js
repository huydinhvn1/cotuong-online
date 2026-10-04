// Tạo ảnh xem trước khi chia sẻ public/og-image.png (1200×630) từ scripts/og/og-image.html.
// (Biểu tượng favicon / apple-touch-icon / icon-192/512 là ảnh cố định trong public/, không tạo bằng script này.)
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
  await b.close();
  console.log('đã tạo public/og-image.png');
})();
