// Hộp "Ủng hộ": chỉ hiện ảnh mã QR Zelle (người nhận HUY DINH) – không email, không số điện thoại, không nút sao chép
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('Ủng hộ qua Zelle: chỉ mã QR + người nhận, không email / số điện thoại / nút sao chép', () => {
  const app = read('public/app.js');
  assert.match(app, /qr: '\/zelle-qr\.png'/);
  assert.match(app, /name: 'HUY DINH'/);
  assert.match(app, /Ủng hộ tác giả qua Zelle/);
  assert.match(app, /Mở app ngân hàng → Zelle → quét mã QR/);
  assert.match(app, /tài khoản ngân hàng tại Mỹ/);
  assert.match(app, /<figure class="zelle-qr"><img src="' \+ ZELLE\.qr/);
  assert.doesNotMatch(app, /copyval|data-what=|zelleEmail|emailHtml|email: '/);
  assert.doesNotMatch(app, /huydinhvn1|@gmail/);
  for (const f of ['public/app.js', 'public/index.html', 'public/style.css', 'README.md', 'server.js']) {
    const s = read(f);
    assert.doesNotMatch(s, /912|881[-\s]?9519|9519|zellePhone|phoneRaw/, f);
  }
  for (const f of ['public/index.html', 'public/style.css', 'server.js']) assert.doesNotMatch(read(f), /huydinhvn1|@gmail/, f);
  // README: dòng giới thiệu Ủng hộ không nhắc email / điện thoại (email liên hệ ở mục trang pháp lý thì được)
  const line = read('README.md').split('\n').find(l => l.includes('**Ủng hộ tác giả**'));
  assert.ok(line && line.includes('zelle-qr.png'));
  assert.doesNotMatch(line, /@|email|số điện thoại|phone|sao chép/i);
  // không chặn nhấn giữ / lưu ảnh trên điện thoại
  const css = read('public/style.css');
  const qrCss = css.slice(css.indexOf('.zelle-qr img'), css.indexOf('}', css.indexOf('.zelle-qr img')));
  assert.doesNotMatch(qrCss, /touch-callout:\s*none|user-select:\s*none|pointer-events:\s*none/);
  assert.doesNotMatch(app, /contextmenu/);
});

test('public/zelle-qr.png tồn tại, là PNG và được server phục vụ', async () => {
  const buf = fs.readFileSync(path.join(ROOT, 'public', 'zelle-qr.png'));
  assert.equal(buf.subarray(1, 4).toString(), 'PNG');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  assert.ok(w >= 600 && h >= 600, `ảnh QR đủ nét (${w}×${h})`);
  const PORT = 3985;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-donate-'));
  const env = { ...process.env, PORT: String(PORT), USERS_FILE: path.join(tmp, 'users.json') };
  for (const k of ['DATABASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET']) delete env[k];
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((ok, bad) => {
      const t = setTimeout(() => bad(new Error('server không khởi động')), 8000);
      srv.stdout.on('data', d => { if (String(d).includes('đang chạy')) { clearTimeout(t); ok(); } });
    });
    const r = await fetch(`http://localhost:${PORT}/zelle-qr.png`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') || '', /image\/png/);
    assert.equal(Buffer.from(await r.arrayBuffer()).length, buf.length);
  } finally { srv.kill(); }
});
