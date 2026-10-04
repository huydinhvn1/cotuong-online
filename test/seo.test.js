// SEO + xem trước khi chia sẻ: robots.txt, sitemap.xml, thẻ <head> trang chủ (vi / ?lang=en), Open Graph / Twitter, JSON-LD, ảnh og-image, link phòng /r/MÃ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { createSeo } = require('../lib/seo');

const PORT = 3982, BASE = `http://localhost:${PORT}`, SITE = 'https://cotuongvn.net';
const ROOT = path.join(__dirname, '..');
let srv;

test.before(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-seo-'));
  const env = { ...process.env, PORT: String(PORT), USERS_FILE: path.join(tmp, 'users.json') };
  for (const k of ['DATABASE_URL', 'PUBLIC_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET']) delete env[k];
  srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((ok, bad) => {
    const t = setTimeout(() => bad(new Error('server không khởi động')), 8000);
    srv.stdout.on('data', d => { if (String(d).includes('đang chạy')) { clearTimeout(t); ok(); } });
  });
});
test.after(() => { if (srv) srv.kill(); });

async function get(p, method = 'GET') { const r = await fetch(BASE + p, { method, redirect: 'manual' }); return { status: r.status, type: r.headers.get('content-type') || '', body: method === 'HEAD' ? '' : await r.text() }; }
const meta = (html, attr, key) => { const m = new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)"`).exec(html); return m && m[1]; };
const og = (h, k) => meta(h, 'property', k), nm = (h, k) => meta(h, 'name', k);
const link = (html, rel, extra = '') => { const m = new RegExp(`<link rel="${rel}"${extra} href="([^"]*)"`).exec(html); return m && m[1]; };
const title = html => (/<title>([^<]*)<\/title>/.exec(html) || [])[1];
const unesc = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

test('robots.txt: cho phép tất cả + trỏ tới sitemap', async () => {
  const r = await get('/robots.txt');
  assert.equal(r.status, 200); assert.match(r.type, /text\/plain/);
  assert.match(r.body, /^User-agent: \*$/m); assert.match(r.body, /^Allow: \/$/m);
  assert.doesNotMatch(r.body, /^Disallow: \/\s*$/m, 'không được chặn toàn site');
  assert.match(r.body, new RegExp(`^Sitemap: ${SITE}/sitemap\\.xml$`, 'm'));
});

test('sitemap.xml: trang chủ + 3 trang pháp lý (vi + en), có hreflang, mọi URL đều mở được', async () => {
  const r = await get('/sitemap.xml');
  assert.equal(r.status, 200); assert.match(r.type, /xml/);
  assert.match(r.body, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(r.body, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9" xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml">/);
  const locs = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => unesc(m[1]));
  assert.deepEqual(locs, ['/', '/?lang=en', '/chinh-sach-bao-mat', '/en/privacy', '/dieu-khoan', '/en/terms', '/xoa-du-lieu', '/en/data-deletion'].map(p => SITE + p));
  assert.equal((r.body.match(/<url>/g) || []).length, 8); assert.equal((r.body.match(/<\/url>/g) || []).length, 8);
  assert.equal((r.body.match(/hreflang="vi"/g) || []).length, 8); assert.equal((r.body.match(/hreflang="en"/g) || []).length, 8);
  assert.match(r.body, /<lastmod>\d{4}-\d\d-\d\d<\/lastmod>/);
  for (const l of locs) { const p = await get(l.slice(SITE.length)); assert.equal(p.status, 200, l); assert.match(p.type, /text\/html/, l); }
});

test('trang chủ: tiêu đề + mô tả tiếng Việt theo từ khoá, lang="vi", canonical, hreflang', async () => {
  const { status, body: h } = await get('/');
  assert.equal(status, 200);
  assert.match(h, /<html lang="vi">/);
  const t = title(h), d = nm(h, 'description').toLowerCase();
  assert.match(t, /^Cờ Tướng Online/); assert.match(t.toLowerCase(), /cờ tướng với máy/); assert.match(t.toLowerCase(), /cờ úp/); assert.match(t.toLowerCase(), /miễn phí/);
  assert.ok(t.length <= 65, 'tiêu đề không quá dài: ' + t.length);
  for (const kw of ['cờ tướng online', 'chơi cờ tướng với máy', 'cờ úp online', 'miễn phí']) assert.ok(d.includes(kw), 'mô tả thiếu: ' + kw);
  assert.ok(d.length >= 110 && d.length <= 200, 'độ dài mô tả ' + d.length);
  assert.equal(link(h, 'canonical'), SITE + '/');
  assert.equal(link(h, 'alternate', ' hreflang="vi"'), SITE + '/');
  assert.equal(link(h, 'alternate', ' hreflang="en"'), SITE + '/?lang=en');
  assert.equal(link(h, 'alternate', ' hreflang="x-default"'), SITE + '/');
  assert.match(nm(h, 'robots'), /^index, follow/);
  // i18n vẫn hoạt động: i18n.js nạp ngay sau <title>, nút VI/EN còn đó
  assert.match(h, /<\/title>\n<script src="\/i18n\.js"><\/script>/); assert.match(h, /id="langBtn"/);
  assert.equal((await get('/index.html')).body, h, '/index.html giống /');
});

test('Open Graph + Twitter card: ảnh tuyệt đối https 1200×630, og:locale vi_VN', async () => {
  const { body: h } = await get('/');
  assert.equal(og(h, 'og:type'), 'website');
  assert.equal(unesc(og(h, 'og:title')), 'Cờ Tướng & Cờ Úp Online – Chơi miễn phí');
  assert.ok(og(h, 'og:description').length > 60);
  assert.equal(og(h, 'og:url'), SITE + '/');
  assert.equal(og(h, 'og:image'), SITE + '/og-image.png');
  assert.equal(og(h, 'og:image:secure_url'), SITE + '/og-image.png');
  assert.equal(og(h, 'og:image:width'), '1200'); assert.equal(og(h, 'og:image:height'), '630'); assert.equal(og(h, 'og:image:type'), 'image/png');
  assert.ok(og(h, 'og:image:alt'));
  assert.equal(og(h, 'og:locale'), 'vi_VN'); assert.equal(og(h, 'og:locale:alternate'), 'en_US');
  assert.equal(nm(h, 'twitter:card'), 'summary_large_image');
  assert.equal(nm(h, 'twitter:image'), SITE + '/og-image.png');
  assert.equal(nm(h, 'twitter:title'), og(h, 'og:title')); assert.equal(nm(h, 'twitter:description'), og(h, 'og:description'));
  // ảnh có thật, đúng kích thước (đọc IHDR của PNG)
  const img = await fetch(BASE + '/og-image.png'); assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png');
  const buf = Buffer.from(await img.arrayBuffer());
  assert.equal(buf.toString('latin1', 1, 4), 'PNG'); assert.equal(buf.readUInt32BE(16), 1200); assert.equal(buf.readUInt32BE(20), 630);
  assert.ok(buf.length < 1.5e6, 'ảnh og nhẹ (< 1,5 MB) cho Facebook / Zalo');
  const ic = Buffer.from(await (await fetch(BASE + '/apple-touch-icon.png')).arrayBuffer());
  assert.equal(ic.readUInt32BE(16), 180);
});

test('JSON-LD: WebApplication + VideoGame, miễn phí, inLanguage vi', async () => {
  const { body: h } = await get('/');
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h); assert.ok(m, 'có JSON-LD');
  const ld = JSON.parse(m[1]);
  assert.equal(ld['@context'], 'https://schema.org');
  assert.ok(ld['@type'].includes('WebApplication') && ld['@type'].includes('VideoGame'));
  assert.equal(ld.inLanguage, 'vi'); assert.equal(ld.url, SITE + '/'); assert.equal(ld.image, SITE + '/og-image.png');
  assert.equal(ld.isAccessibleForFree, true); assert.equal(ld.offers['@type'], 'Offer'); assert.equal(ld.offers.price, '0');
  assert.equal(ld.applicationCategory, 'GameApplication'); assert.match(ld.name, /Cờ Tướng/);
});

test('?lang=en: thẻ tiếng Anh (lang, tiêu đề, mô tả, canonical, og:locale)', async () => {
  const { body: h } = await get('/?lang=en');
  assert.match(h, /<html lang="en">/);
  assert.match(unesc(title(h)), /^Xiangqi Online/); assert.match(nm(h, 'description'), /Xiangqi/);
  assert.equal(link(h, 'canonical'), SITE + '/?lang=en'); assert.equal(og(h, 'og:url'), SITE + '/?lang=en');
  assert.equal(og(h, 'og:locale'), 'en_US'); assert.equal(og(h, 'og:locale:alternate'), 'vi_VN');
  assert.equal(og(h, 'og:image'), SITE + '/og-image.png');
});

class Client {
  constructor(name) { this.name = name; this.token = crypto.randomBytes(16).toString('hex'); this.msgs = []; this.waiters = []; }
  open() { return new Promise((res, rej) => { this.ws = new WebSocket(`ws://localhost:${PORT}/ws`); this.ws.on('open', () => { this.send({ type: 'hello', token: this.token, name: this.name }); res(); }); this.ws.on('error', rej); this.ws.on('message', d => { const m = JSON.parse(d); this.msgs.push(m); this.waiters = this.waiters.filter(w => !w(m)); }); }); }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(pred, ms = 4000) { const hit = this.msgs.find(pred); if (hit) return Promise.resolve(hit); return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('hết giờ')), ms); this.waiters.push(m => { if (pred(m)) { clearTimeout(t); res(m); return true; } return false; }); }); }
}

test('link phòng /r/MÃ: "… mời bạn vào phòng cờ úp …", og:url đúng phòng, noindex, tên được escape', async () => {
  const A = new Client('Huy <b>"x"'); await A.open();
  A.send({ type: 'create', minutes: 10, increment: 5, color: 'r', variant: 'jieqi' });
  const { roomId } = await A.wait(m => m.type === 'created');
  const { status, body: h } = await get('/r/' + roomId);
  assert.equal(status, 200);
  assert.equal(unesc(og(h, 'og:title')), `Huy <b>"x" mời bạn vào phòng cờ úp ${roomId}`);
  assert.doesNotMatch(h, /Huy <b>/, 'tên người chơi phải được escape');
  assert.match(title(h), new RegExp(`^Mời bạn vào phòng cờ úp ${roomId}`));
  assert.match(unesc(og(h, 'og:description')), /Phòng cờ úp · ⏱ 10 phút \+ 5s – Huy <b>"x" đang chờ\. Bấm link để vào chơi ngay/);
  assert.equal(og(h, 'og:url'), `${SITE}/r/${roomId}`); assert.equal(link(h, 'canonical'), `${SITE}/r/${roomId}`);
  assert.equal(nm(h, 'twitter:title'), og(h, 'og:title'));
  assert.equal(og(h, 'og:image'), SITE + '/og-image.png');
  assert.equal(nm(h, 'robots'), 'noindex, follow');
  assert.match(h, /id="langBtn"/, 'vẫn là trang ứng dụng');
  assert.equal((await get('/r/' + roomId, 'HEAD')).status, 200);
  A.ws.close();
  // phòng cờ tướng thường, phòng không tồn tại, mã lạ
  const B = new Client('Lan'); await B.open(); B.send({ type: 'create', minutes: 0, color: 'b' });
  const r2 = (await B.wait(m => m.type === 'created')).roomId;
  assert.equal(unesc(og((await get('/r/' + r2)).body, 'og:title')), `Lan mời bạn vào phòng cờ tướng ${r2}`);
  B.ws.close();
  const none = (await get('/r/ZZZZ99')).body;
  assert.equal(og(none, 'og:title'), 'Mời bạn vào phòng cờ ZZZZ99'); assert.equal(og(none, 'og:url'), SITE + '/r/ZZZZ99');
  const bad = await get('/r/' + encodeURIComponent('"><script>alert(1)</script>'));
  assert.ok(bad.status === 200 || bad.status === 404);
  assert.doesNotMatch(bad.body, /<script>alert/);
});

test('PUBLIC_URL khác: mọi URL tuyệt đối (canonical, og, sitemap, robots) theo PUBLIC_URL', () => {
  const s = createSeo({ env: { PUBLIC_URL: 'https://staging.example.org/' }, rooms: new Map() });
  assert.equal(s.BASE, 'https://staging.example.org');
  const h = s.home('vi');
  assert.doesNotMatch(h, /cotuongvn\.net\//); assert.match(h, /<link rel="canonical" href="https:\/\/staging\.example\.org\/">/);
  assert.match(h, /og:image" content="https:\/\/staging\.example\.org\/og-image\.png"/);
  assert.match(s.robots(), /Sitemap: https:\/\/staging\.example\.org\/sitemap\.xml/);
  assert.match(s.sitemap(), /<loc>https:\/\/staging\.example\.org\/en\/terms<\/loc>/);
  assert.equal(createSeo({ env: {}, rooms: new Map() }).BASE, SITE, 'mặc định cotuongvn.net');
});

test('Biểu tượng: favicon.ico (16/32/48), favicon.svg, apple-touch 180, manifest (any + maskable), có link trong mọi trang', async () => {
  const ico = await fetch(BASE + '/favicon.ico'); assert.equal(ico.status, 200);
  const ib = Buffer.from(await ico.arrayBuffer());
  assert.equal(ib.readUInt16LE(0), 0); assert.equal(ib.readUInt16LE(2), 1); // ICO header
  const sizes = []; for (let i = 0; i < ib.readUInt16LE(4); i++) sizes.push(ib[6 + i * 16] || 256);
  assert.deepEqual(sizes.sort((a, b) => a - b), [16, 32, 48]);
  const svg = await fetch(BASE + '/favicon.svg'); assert.equal(svg.status, 200); assert.match(svg.headers.get('content-type'), /image\/svg\+xml/);
  const png = async (p, w) => { const r = await fetch(BASE + p); assert.equal(r.status, 200, p); const b = Buffer.from(await r.arrayBuffer()); assert.equal(b.toString('latin1', 1, 4), 'PNG', p); assert.equal(b.readUInt32BE(16), w, p); assert.equal(b.readUInt32BE(20), w, p); };
  await png('/apple-touch-icon.png', 180); await png('/icon-192.png', 192); await png('/icon-512.png', 512); await png('/icon-512-maskable.png', 512);
  await png('/favicon-16.png', 16); await png('/favicon-32.png', 32);
  const mr = await fetch(BASE + '/manifest.webmanifest'); assert.equal(mr.status, 200);
  const m = JSON.parse(await mr.text());
  assert.equal(m.name, 'Cờ Tướng Online'); assert.equal(m.short_name, 'Cờ Tướng'); assert.equal(m.start_url, '/'); assert.equal(m.display, 'standalone');
  assert.equal(m.theme_color, '#1a1310'); assert.equal(m.background_color, '#1a1310');
  assert.ok(m.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512'));
  assert.ok(m.icons.some(i => i.purpose === 'any' && i.sizes === '192x192'));
  for (const i of m.icons) assert.equal((await fetch(BASE + i.src)).status, 200, i.src);
  for (const p of ['/', '/chinh-sach-bao-mat', '/dieu-khoan', '/xoa-du-lieu', '/en/privacy', '/en/terms', '/en/data-deletion']) {
    const h = await (await fetch(BASE + p)).text();
    for (const re of [/<link rel="icon" href="\/favicon\.ico\?v=\w+"/, /<link rel="icon" href="\/favicon\.svg\?v=\w+" type="image\/svg\+xml">/, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png\?v=\w+">/, /<link rel="manifest" href="\/manifest\.webmanifest\?v=\w+">/])
      assert.match(h, re, p);
  }
});
