// Song ngữ VI / EN: mọi khoá có ở cả hai ngôn ngữ, tham số khớp nhau, bản tiếng Anh không còn chữ tiếng Việt,
// mọi khoá mà giao diện / server dùng đều có trong từ điển, ký hiệu nước đi tiếng Anh, trang pháp lý tiếng Anh.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const I18N = require(path.join(ROOT, 'public/i18n.js'));
const { vi, en } = I18N.dict;
// chữ cái có dấu đặc trưng của tiếng Việt (không gồm dấu câu, ký tự Hán, emoji)
const VN = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
const params = s => [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort();
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('mọi khoá có ở cả tiếng Việt và tiếng Anh, không rỗng, cùng tham số', () => {
  const kv = Object.keys(vi).sort(), ke = Object.keys(en).sort();
  assert.deepEqual(kv, ke, 'hai bộ khoá khác nhau');
  assert.ok(kv.length > 250, 'từ điển quá ít khoá: ' + kv.length);
  for (const k of kv) {
    assert.equal(typeof vi[k], 'string', k); assert.equal(typeof en[k], 'string', k);
    assert.ok(vi[k].trim() && en[k].trim(), 'rỗng: ' + k);
    if (!k.endsWith('.one')) assert.deepEqual(params(vi[k]), params(en[k]), 'tham số khác nhau: ' + k);
  }
});

test('bản tiếng Anh không còn chữ tiếng Việt; dùng đúng thuật ngữ cờ tướng', () => {
  for (const [k, s] of Object.entries(en)) assert.doesNotMatch(s, VN, 'EN còn tiếng Việt: ' + k + ' = ' + s);
  assert.equal(en['v.jieqiLong'], 'Jieqi (hidden pieces)');
  assert.equal(en['v.standard'], 'Xiangqi');
  for (const w of ['General', 'Advisor', 'Elephant', 'Horse', 'Chariot', 'Cannon', 'Soldier']) assert.match(en['moves.legend'], new RegExp('\\b' + w + '\\b'), w);
  for (const w of ['General', 'Advisor', 'Elephant', 'Cannon', 'Horse']) assert.ok(Object.keys(en).some(k => k.startsWith('jq.') && en[k].includes(w)), 'luật cờ úp EN thiếu ' + w);
  // bản tiếng Việt thật sự là tiếng Việt (không quên dịch ngược)
  const viOnly = Object.keys(vi).filter(k => VN.test(vi[k]));
  assert.ok(viOnly.length > 200, 'quá ít chuỗi tiếng Việt: ' + viOnly.length);
});

test('mọi khoá dùng trong app.js / index.html / server.js đều có trong từ điển', () => {
  const app = read('public/app.js'), html = read('public/index.html'), srv = read('server.js');
  const used = new Set();
  for (const m of app.matchAll(/\bth?\('([a-z][\w.]*)'(?!\s*\+)/g)) used.add(m[1]);
  for (const m of html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) used.add(m[1]);
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) used.add(pair.split(':')[1].trim());
  for (const m of srv.matchAll(/'(ts\.\w+)'/g)) used.add(m[1]);
  for (const m of srv.matchAll(/errMsg\('(\w+)'/g)) used.add('err.' + m[1]);
  for (const m of srv.matchAll(/fail\('(\w+)'/g)) used.add('dme.' + m[1]);
  // khoá ghép động
  for (let i = 1; i <= 5; i++) used.add('lv.' + i);
  for (let i = 1; i <= 6; i++) used.add('jq.r' + i);
  for (const r of ['checkmate', 'stalemate', 'timeout', 'resign', 'agreement', 'repetition', 'nocapture', 'insufficient', 'perpetual', 'abandon', 'aborted']) used.add('r.' + r);
  for (const x of ['undo', 'draw', 'rematch']) { used.add('of.' + x); used.add('of.wait.' + x); used.add('om.' + x); used.add('dw.' + x); }
  for (const v of ['standard', 'jieqi']) used.add('v.lower.' + v);
  assert.ok(used.size > 200, 'quét được quá ít khoá: ' + used.size);
  const missing = [...used].filter(k => vi[k] == null || en[k] == null);
  assert.deepEqual(missing, [], 'thiếu khoá');
  // server: thông báo/lỗi đều kèm key (client dịch theo ngôn ngữ), vẫn giữ text tiếng Việt cho client cũ
  assert.doesNotMatch(srv, /type: 'error', text:/, 'còn lỗi không có mã');
  assert.match(srv, /key: 'dme\.' \+ code/);
  assert.doesNotMatch(srv, /notify\(room, (`[^`]*`|'[^']*')\);/, 'còn notify không có key');
});

test('app.js / index.html không còn chuỗi tiếng Việt viết cứng ngoài từ điển', () => {
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  const app = strip(read('public/app.js'));
  const bad = app.split('\n').filter(l => VN.test(l));
  assert.deepEqual(bad, [], 'app.js còn tiếng Việt');
  // index.html: mọi phần tử có chữ tiếng Việt đều mang data-i18n* (nội dung sẽ được thay khi chọn EN)
  const html = read('public/index.html').replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  const leftovers = [];
  for (const m of html.matchAll(/<(\/?[a-z0-9]+)([^>]*)>([^<]*)/gi)) {
    const [, tag, attrs, text] = m;
    if (tag[0] === '/') { if (VN.test(text)) leftovers.push('sau ' + tag + ': ' + text.trim()); continue; } // chữ nằm sau thẻ đóng: không phần tử nào dịch được
    if (tag === 'title') continue; // tiêu đề trang do app.js đặt
    if (VN.test(text) && !/data-i18n(-html)?=/.test(attrs) && !/<[^>]*data-i18n-html=/.test(html.slice(0, m.index).split('\n').pop())) leftovers.push(tag + ': ' + text.trim());
    for (const a of attrs.matchAll(/\b(title|aria-label|placeholder|content)="([^"]*)"/g)) {
      if (!VN.test(a[2])) continue;
      const covered = (attrs.match(/data-i18n-attr="([^"]+)"/) || [, ''])[1].split(';').some(p => p.split(':')[0].trim() === a[1]);
      const dynamic = /id="(inboxBtn)"/.test(attrs) && a[1] === 'aria-label'; // đặt lại trong renderInboxBadge
      const meta = tag === 'meta'; // meta description do I18N.apply() đặt
      if (!covered && !dynamic && !meta) leftovers.push(tag + ' @' + a[1] + ': ' + a[2]);
    }
  }
  // các đoạn chữ nằm trong phần tử cha có data-i18n-html (vd <small>online</small> trong brand, <span>Online</span> trong h1) không chứa tiếng Việt -> không lọt vào đây
  assert.deepEqual(leftovers, [], 'index.html còn chữ tiếng Việt không có data-i18n');
});

test('ngôn ngữ mặc định theo navigator.language: vi* -> VI, còn lại -> EN', () => {
  for (const [l, want] of [['vi', 'vi'], ['vi-VN', 'vi'], ['VI-vn', 'vi'], ['en-US', 'en'], ['en', 'en'], ['fr-FR', 'en'], ['zh-CN', 'en'], ['', 'en']]) assert.equal(I18N.norm(l), want, l);
});

test('ký hiệu nước đi tiếng Anh (WXF): K/A/E/H/R/C/P, + - =, f/m/r', () => {
  const cases = { 'P2-5': 'C2=5', 'M8.7': 'H8+7', 'Xt.1': 'Rf+1', 'Xs/2': 'Rr-2', 'Bg.1': 'Pm+1', 'Tg5.1': 'K5+1', 'T3.5': 'E3+5', 'S4.5': 'A4+5', 'X1/2(P)': 'R1-2(C)', 'B7.1(M)': 'P7+1(H)' };
  for (const [vn, wxf] of Object.entries(cases)) { assert.equal(I18N.notation(vn, 'en'), wxf, vn); assert.equal(I18N.notation(vn, 'vi'), vn); }
  // mọi ký hiệu thật do bộ luật sinh ra đều đổi được
  const X = require(path.join(ROOT, 'shared/xiangqi.js'));
  let g = new X.Game(), seen = 0;
  for (let i = 0; i < 60; i++) {
    const ms = g.moves(); if (!ms.length) break;
    for (const m of ms) { const n = X.notation(g.board, m.from, m.to); seen++; assert.match(I18N.notation(n, 'en'), /^[KAEHRCP][1-9fmr][+=-][1-9]$/, n); }
    const m = ms[(i * 7) % ms.length]; g.move(m.from, m.to);
  }
  assert.ok(seen > 100, 'kiểm được quá ít nước: ' + seen);
});

test('trang pháp lý tiếng Anh đầy đủ: /en/privacy, /en/terms, /en/data-deletion; URL cũ vẫn chạy và có liên kết qua lại', async () => {
  const PORT = 3990, BASE = `http://localhost:${PORT}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-i18n-'));
  const env = { ...process.env, PORT: String(PORT), USERS_FILE: path.join(tmp, 'users.json') };
  for (const k of ['DATABASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET']) delete env[k];
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((ok, bad) => { const t = setTimeout(() => bad(new Error('server không khởi động')), 8000); srv.stdout.on('data', d => { if (String(d).includes('đang chạy')) { clearTimeout(t); ok(); } }); });
    const get = async p => { const r = await fetch(BASE + p); return { status: r.status, html: await r.text() }; };
    const pairs = { '/en/privacy': '/chinh-sach-bao-mat', '/en/terms': '/dieu-khoan', '/en/data-deletion': '/xoa-du-lieu' };
    for (const [enUrl, viUrl] of Object.entries(pairs)) {
      const e = await get(enUrl), v = await get(viUrl);
      assert.equal(e.status, 200, enUrl); assert.equal(v.status, 200, viUrl);
      assert.match(e.html, /<html lang="en">/, enUrl);
      assert.match(e.html, /huydinhvn1@gmail\.com/, enUrl);
      assert.ok(e.html.includes(`href="${viUrl}"`), enUrl + ' -> ' + viUrl);
      assert.ok(v.html.includes(`href="${enUrl}"`), viUrl + ' -> ' + enUrl);
      assert.ok(e.html.length > 3500, enUrl + ' quá ngắn (không phải bản đầy đủ)');
      // ngoài tên ứng dụng "Cờ Tướng Online" và liên kết "Tiếng Việt", không còn chữ tiếng Việt
      const body = e.html.replace(/Cờ Tướng Online/g, '').replace(/>Tiếng Việt</g, '><');
      assert.doesNotMatch(body, VN, enUrl + ' còn tiếng Việt: ' + (body.match(new RegExp('.{0,40}' + VN.source + '.{0,40}', 'i')) || [''])[0]);
    }
    assert.equal((await get('/en/privacy-policy')).html, (await get('/en/privacy')).html);
    const priv = (await get('/en/privacy')).html;
    for (const s of ['openid', 'profile', 'ct_session', 'private messages', 'block list', 'not</b> store your email', 'Elo', '500 characters']) assert.ok(priv.includes(s), 'privacy EN thiếu: ' + s);
    const del = (await get('/en/data-deletion')).html;
    assert.match(del, /30 days/); assert.match(del, /id="myAccount" hidden/); assert.match(del, /fetch\('\/api\/me'/);
    // sảnh: chân trang đổi link theo ngôn ngữ
    const lobby = (await get('/')).html;
    for (const [enUrl, viUrl] of Object.entries(pairs)) assert.match(lobby, new RegExp(`href="${viUrl}" data-href-en="${enUrl}"`));
    assert.match(lobby, /<script src="\/i18n\.js"><\/script>[\s\S]*<script src="\/app\.js">/);
    assert.match(lobby, /id="langBtn"/);
    assert.equal((await fetch(BASE + '/i18n.js')).status, 200);
  } finally { srv.kill(); }
});
