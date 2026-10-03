// Trang pháp lý tĩnh (chính sách bảo mật, điều khoản, xoá dữ liệu) + bí danh tiếng Anh + liên kết ở sảnh.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3989, BASE = `http://localhost:${PORT}`;
const ROOT = path.join(__dirname, '..');
const PAGES = {
  '/chinh-sach-bao-mat': ['/privacy', '/privacy-policy'],
  '/dieu-khoan': ['/terms'],
  '/xoa-du-lieu': ['/data-deletion'],
};
let srv;

test.before(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-legal-'));
  const env = { ...process.env, PORT: String(PORT), USERS_FILE: path.join(tmp, 'users.json') };
  for (const k of ['DATABASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET']) delete env[k];
  srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((ok, bad) => {
    const t = setTimeout(() => bad(new Error('server không khởi động')), 8000);
    srv.stdout.on('data', d => { if (String(d).includes('đang chạy')) { clearTimeout(t); ok(); } });
  });
});
test.after(() => { if (srv) srv.kill(); });

async function get(p) { const r = await fetch(BASE + p, { redirect: 'manual' }); return { status: r.status, type: r.headers.get('content-type') || '', html: await r.text() }; }

test('3 trang pháp lý + bí danh trả về 200 cùng nội dung', async () => {
  for (const [p, aliases] of Object.entries(PAGES)) {
    const main = await get(p);
    assert.equal(main.status, 200, p);
    assert.match(main.type, /text\/html/);
    assert.match(main.html, /<html lang="vi">/);
    assert.match(main.html, /name="viewport"/);
    assert.match(main.html, /id="english"[^>]*lang="en"/, p + ' có phần tiếng Anh');
    assert.match(main.html, /huydinhvn1@gmail\.com/, p + ' có email liên hệ');
    for (const a of aliases) { const r = await get(a); assert.equal(r.status, 200, a); assert.equal(r.html, main.html, a + ' = ' + p); }
  }
});

test('chính sách bảo mật mô tả đúng dữ liệu thu thập', async () => {
  const { html } = await get('/chinh-sach-bao-mat');
  for (const s of ['openid', 'profile', 'public_profile', 'Tên hiển thị', 'ảnh đại diện', 'Thắng/Thua/Hoà', 'không bán', 'ct_session', 'khách', '/xoa-du-lieu'])
    assert.ok(html.toLowerCase().includes(s.toLowerCase()), 'thiếu: ' + s);
  assert.match(html, /không<\/b> lưu địa chỉ email/);
  // Khẳng định "không lưu email" phải đúng với mã nguồn: scope không có email, Facebook không xin trường email, kho không có cột email
  const auth = fs.readFileSync(path.join(ROOT, 'lib/auth.js'), 'utf8'), store = fs.readFileSync(path.join(ROOT, 'lib/store.js'), 'utf8');
  assert.match(auth, /'openid profile'/);
  assert.doesNotMatch(auth, /scope', '[^']*email/);
  assert.doesNotMatch(auth, /fields: '[^']*email/);
  assert.doesNotMatch(store, /email/i);
  // tin nhắn riêng được lưu -> chính sách phải nói rõ (VI + EN), và trang xoá dữ liệu nhắc tới tin nhắn
  for (const t of ['Tin nhắn riêng', 'danh sách người bạn đã chặn', '500 ký tự', 'không mã hoá đầu-cuối', 'private messages', 'block list', 'Thông tin người chơi'])
    assert.ok(html.includes(t), 'chính sách thiếu: ' + t);
  assert.match(store, /_messages/); assert.match(store, /_blocks/);
  const del = (await get('/xoa-du-lieu')).html;
  assert.match(del, /tin nhắn riêng/); assert.match(del, /private messages/);
});

test('trang xoá dữ liệu: hướng dẫn + ô tài khoản (ẩn với khách)', async () => {
  const { html } = await get('/xoa-du-lieu');
  assert.match(html, /mailto:huydinhvn1@gmail\.com/);
  assert.match(html, /30 ngày/);
  assert.match(html, /id="myAccount" hidden/);
  assert.match(html, /fetch\('\/api\/me'/);
});

test('sảnh có liên kết chân trang tới 3 trang', async () => {
  const { html } = await get('/');
  for (const p of Object.keys(PAGES)) assert.match(html, new RegExp(`class="foot-links"[\\s\\S]*href="${p}"`), p);
});
