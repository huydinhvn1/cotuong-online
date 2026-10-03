// Kiểm thử trình duyệt (Chromium + WebKit) cho bản song ngữ VI / EN.
// Ở chế độ EN: duyệt sảnh, luật cờ úp, ủng hộ, thẻ người chơi, hộp thư / tin nhắn, ván với máy (cờ tướng + cờ úp), phòng online
// (thông báo server, chat, cầu hoà, kết thúc ván), ghép trận + Elo, lỗi "không tìm thấy phòng" – và khẳng định KHÔNG còn chữ tiếng Việt
// nào trong DOM (chữ + title/aria-label/placeholder/alt), tiêu đề trang, <html lang>. Bố cục 320px không tràn / không chồng.
// Ngôn ngữ mặc định theo navigator.language, nhớ trong localStorage, nút VI/EN đổi ngay không cần tải lại.
// Chạy: npm i --no-save playwright-core && npx playwright-core install chromium webkit && node scripts/check-i18n.js
// Biến môi trường: ENGINES=chromium,webkit, CHROME=đường dẫn Chrome, PW=đường dẫn playwright-core, PORT (mặc định 3009), OUT=thư mục ảnh
const pw = require(process.env.PW || 'playwright-core');
const { spawn } = require('child_process');
const crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path');
const PORT = +process.env.PORT || 3009, BASE = `http://localhost:${PORT}`, SECRET = 'e2e-i18n';
const ENGINES = (process.env.ENGINES || 'chromium,webkit').split(',');
const OUT = process.env.OUT || path.join(os.tmpdir(), 'ct-i18n-shots'); fs.mkdirSync(OUT, { recursive: true });
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-i18n-'));
let checks = 0, fails = 0;
const ok = (c, m) => { checks++; if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = new Date('2026-09-15T10:00:00Z').toISOString();
const mkUsers = () => [
  { id: '00000001-0000-4000-8000-000000000001', provider: 'google', providerId: 'PID-1', name: 'Huy', avatar: '', createdAt: now, wins: 5, losses: 2, draws: 1, ratings: { standard: { rating: 1234, games: 7 }, jieqi: { rating: 1188, games: 1 } } },
  { id: '00000002-0000-4000-8000-000000000002', provider: 'facebook', providerId: 'PID-2', name: 'Lan', avatar: '', createdAt: now, wins: 0, losses: 0, draws: 0 },
];
const cookie = uid => { const d = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 864e5 })).toString('base64url'); return d + '.' + crypto.createHmac('sha256', SECRET).update(d).digest('base64url'); };

// Mọi chữ tiếng Việt còn sót trong DOM (kể cả phần tử đang ẩn) + thuộc tính hiển thị + tiêu đề trang
const vnLeft = p => p.evaluate(() => {
  const VN = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i, out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode; if (n.parentElement.closest('script,style')) continue; if (VN.test(n.nodeValue)) out.push(n.nodeValue.trim().slice(0, 90)); }
  document.querySelectorAll('*').forEach(e => { for (const a of ['title', 'aria-label', 'placeholder', 'alt', 'value']) { const v = e.getAttribute(a); if (v && VN.test(v)) out.push('@' + a + ': ' + v.slice(0, 90)); } });
  if (VN.test(document.title)) out.push('<title>: ' + document.title);
  const md = document.querySelector('meta[name="description"]'); if (md && VN.test(md.content)) out.push('<meta>: ' + md.content);
  if (document.documentElement.lang !== 'en') out.push('<html lang="' + document.documentElement.lang + '">');
  return out;
});
// Bố cục: không cuộn ngang, thanh trên một hàng không chồng, nút / ô chọn không bị cắt chữ
const layout = p => p.evaluate(() => {
  const W = innerWidth, bad = [];
  if (document.documentElement.scrollWidth > W + 0.5) bad.push('hscroll ' + document.documentElement.scrollWidth);
  const vis = [...document.querySelectorAll('.topbar .brand-mark, .topbar .brand-text, #variantBadge, .topbar-actions > *')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map(e => [e, e.getBoundingClientRect()]);
  vis.forEach(([e, a], i) => { if (a.left < -0.5 || a.right > W + 0.5) bad.push('topbar out ' + (e.id || e.className)); vis.forEach(([f, c], j) => { if (i < j && a.right > c.left + 0.5 && c.right > a.left + 0.5 && a.bottom > c.top && c.bottom > a.top) bad.push('topbar overlap ' + (e.id || e.className) + ' / ' + (f.id || f.className)); }); });
  const tb = document.querySelector('.topbar').getBoundingClientRect(); if (tb.height > 66) bad.push('topbar 2 rows ' + Math.round(tb.height));
  document.querySelectorAll('.btn, .seg button, .tab, .help-link, .acc-btn, .vbadge, .live-stat, .live-var, .quick-ctl, .pc-v, .pc-stats div, .controls .btn span').forEach(e => {
    if (!e.offsetParent || !e.clientWidth) return;
    const r = e.getBoundingClientRect();
    if (e.scrollWidth > e.clientWidth + 1) bad.push('clipped "' + e.textContent.trim().slice(0, 30) + '" ' + e.scrollWidth + '>' + e.clientWidth);
    if (r.right > W + 0.5 || r.left < -0.5) bad.push('out "' + e.textContent.trim().slice(0, 30) + '"');
    // một từ bị bẻ giữa chừng (vd "Begin|ner") -> nút quá hẹp cho chữ tiếng Anh
    const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) for (const m of n.data.matchAll(/\S+/g)) {
      const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
      const tops = new Set([...rg.getClientRects()].filter(q => q.width > 0).map(q => Math.round(q.top / 3)));
      if (tops.size > 1) bad.push('word broken "' + m[0] + '"');
    }
  });
  return [...new Set(bad)];
});
const modalFits = p => p.evaluate(() => { const c = document.querySelector('#modalCard').getBoundingClientRect(); return c.left >= -0.5 && c.right <= innerWidth + 0.5 && document.documentElement.scrollWidth <= innerWidth + 0.5; });

(async () => {
  fs.writeFileSync(path.join(DIR, 'users.json'), JSON.stringify({ users: mkUsers() }));
  const env = { ...process.env, PORT: String(PORT), USERS_FILE: path.join(DIR, 'users.json'), SESSION_SECRET: SECRET, GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y', DATABASE_URL: '' };
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((r, j) => { srv.stdout.on('data', d => /đang chạy/.test(d) && r()); srv.on('exit', () => j(new Error('server exited'))); });
  const [U1, U2] = mkUsers();
  try {
    // ---------- server gửi mã + key, không chỉ chữ tiếng Việt ----------
    {
      const WS = globalThis.WebSocket || require(path.join(__dirname, '..', 'node_modules', 'ws'));
      const ws = new WS(`ws://localhost:${PORT}/ws`), got = [];
      await new Promise(r => { ws.onopen = r; }); ws.onmessage = e => got.push(JSON.parse(e.data));
      ws.send(JSON.stringify({ type: 'hello', token: 'i18n-probe', name: 'Probe' })); ws.send(JSON.stringify({ type: 'join', roomId: 'ZZZZZZ' })); ws.send(JSON.stringify({ type: 'mm_join', variant: 'standard' }));
      await sleep(400); ws.close();
      const nr = got.find(m => m.code === 'no_room'), ml = got.find(m => m.code === 'mm_login');
      ok(nr && nr.key === 'err.no_room' && /Không tìm thấy phòng/.test(nr.text) && ml && ml.key === 'err.mm_login', 'server: lỗi kèm code + key (client dịch), text tiếng Việt giữ cho client cũ');
    }
    for (const eng of ENGINES) {
      const b = await pw[eng].launch(eng === 'chromium' ? { executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] } : {});
      const ctxs = [];
      const mk = async (uid, w, h, locale = 'en-US', url = '/') => {
        const ctx = await b.newContext({ locale, viewport: { width: w, height: h }, isMobile: eng === 'chromium' && w < 1000, hasTouch: w < 1000, deviceScaleFactor: 2 }); ctxs.push(ctx);
        if (uid) await ctx.addCookies([{ name: 'ct_session', value: cookie(uid), url: BASE }]);
        const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
        await p.goto(BASE + url, { waitUntil: 'networkidle' }); return p;
      };
      const scan = async (p, tag) => { const v = await vnLeft(p); ok(v.length === 0, `${eng} EN ${tag}: không còn tiếng Việt ${v.length ? JSON.stringify(v.slice(0, 6)) : ''}`); };
      const lay = async (p, tag) => { const l = await layout(p); ok(l.length === 0, `${eng} EN ${tag}: bố cục vừa, không tràn / chồng ${l.length ? JSON.stringify(l.slice(0, 6)) : ''}`); };
      const shot = (p, name) => p.screenshot({ path: path.join(OUT, `${name}-${eng}.png`) });

      // ---------- ngôn ngữ mặc định ----------
      for (const [loc, want] of [['vi-VN', 'vi'], ['en-US', 'en'], ['fr-FR', 'en']]) {
        const p = await mk(null, 390, 844, loc);
        const s = await p.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, btn: document.querySelector('#langBtn').textContent, h: document.querySelector('#card-x') ? '' : document.querySelector('.cards h2').textContent }));
        ok(s.lang === want && s.btn === want.toUpperCase() && (want === 'vi' ? s.title === 'Cờ Tướng Online' && s.h === 'Chơi với bạn' : s.title === 'Xiangqi Online' && s.h === 'Play a friend'), `${eng} navigator.language ${loc} -> ${want.toUpperCase()} ${JSON.stringify(s)}`);
      }

      // ---------- Sảnh khách 320 (EN) ----------
      const G = await mk(null, 320, 568);
      await scan(G, 'sảnh khách 320'); await lay(G, 'sảnh khách 320'); await shot(G, 'en-sanh-khach-320');
      const foot = await G.evaluate(() => [...document.querySelectorAll('.foot-links a')].map(a => a.getAttribute('href')));
      ok(foot.join() === '/en/privacy,/en/terms,/en/data-deletion', `${eng} EN chân trang trỏ tới trang pháp lý tiếng Anh ${foot}`);
      await G.click('#lobby [data-act="jqrules"]'); await G.waitForSelector('.jq-rules');
      ok(/Jieqi \(hidden pieces\) rules/.test(await G.textContent('#modalCard')) && /General/.test(await G.textContent('#modalCard')), `${eng} EN luật cờ úp bằng tiếng Anh`);
      await scan(G, 'luật cờ úp'); ok(await modalFits(G), `${eng} EN luật cờ úp vừa 320`); await G.click('#modalCard [data-act="modal-close"]');
      await G.click('.topbar .donate-btn'); await G.waitForSelector('.zelle-qr img');
      ok(/Support the author via Zelle/.test(await G.textContent('#modalCard')) && /HUY DINH/.test(await G.textContent('#modalCard')), `${eng} EN hộp Ủng hộ bằng tiếng Anh`);
      await scan(G, 'ủng hộ'); ok(await modalFits(G), `${eng} EN hộp Ủng hộ vừa 320`); await shot(G, 'en-ung-ho-320');
      // đổi ngôn ngữ khi hộp đang mở: dịch lại ngay
      await G.evaluate(() => document.querySelector('#langBtn').click()); // hộp che thanh trên -> bấm bằng JS để thử dịch lại khi hộp đang mở
      const vi = await G.evaluate(() => ({ lang: document.documentElement.lang, t: document.title, m: document.querySelector('#modalCard h3').textContent, btn: document.querySelector('#langBtn').textContent, ls: localStorage.getItem('ct_lang'), h: document.querySelector('.cards h2').textContent, foot: document.querySelector('.foot-links a').getAttribute('href') }));
      ok(vi.lang === 'vi' && vi.t === 'Cờ Tướng Online' && vi.m === 'Ủng hộ tác giả qua Zelle' && vi.btn === 'VI' && vi.ls === 'vi' && vi.h === 'Chơi với bạn' && vi.foot === '/chinh-sach-bao-mat', `${eng} bấm VI/EN -> tiếng Việt ngay (cả hộp đang mở), nhớ localStorage ${JSON.stringify(vi)}`);
      await G.click('#modalCard [data-act="modal-close"]');
      await G.reload({ waitUntil: 'networkidle' });
      ok(await G.evaluate(() => document.documentElement.lang === 'vi' && document.querySelector('#langBtn').textContent === 'VI'), `${eng} tải lại trang vẫn giữ tiếng Việt (localStorage) dù trình duyệt là en-US`);
      await G.click('#langBtn'); await sleep(100); await scan(G, 'đổi lại EN');
      await G.click('.foot-links a[href="/en/privacy"]'); await G.waitForURL(/\/en\/privacy$/);
      ok(await G.evaluate(() => document.documentElement.lang === 'en' && /Privacy Policy/.test(document.querySelector('h1').textContent)), `${eng} EN chân trang -> /en/privacy (bản tiếng Anh đầy đủ)`);
      await G.goBack({ waitUntil: 'networkidle' });

      // ---------- Ván với máy: cờ tướng, cầm Đen (máy đi trước) ----------
      await G.click('#aiColorSeg [data-v="b"]'); await G.click('#aiBtn'); await G.waitForSelector('#game:not([hidden])');
      await G.waitForFunction(() => document.querySelectorAll('#moves .mv').length >= 1, null, { timeout: 15000 });
      const mv = await G.evaluate(() => ({ n: document.querySelector('#moves .mv').textContent, st: document.querySelector('#status').textContent, badge: document.querySelector('#variantBadge').textContent, room: document.querySelector('#roomPanel').textContent, legend: document.querySelector('.moves-legend').textContent }));
      ok(/^[KAEHRCP][1-9fmr][+=-][1-9]\+?$/.test(mv.n) && /Your move/.test(mv.st) && /Xiangqi/.test(mv.badge) && /Vs computer/.test(mv.room) && /Chariot/.test(mv.legend), `${eng} EN ván với máy: ký hiệu nước WXF, trạng thái, nhãn ${JSON.stringify(mv)}`);
      await scan(G, 'ván với máy 320'); await lay(G, 'ván với máy 320'); await shot(G, 'en-van-may-320');
      await G.click('[data-act="hint"]'); await sleep(150); await scan(G, 'gợi ý (toast)');
      await G.click('[data-act="pcard"][data-side="r"]'); await G.waitForSelector('#modalCard .pcard');
      ok(/Computer/.test(await G.textContent('#modalCard')), `${eng} EN thẻ máy`); await scan(G, 'thẻ máy'); await G.click('#modalCard [data-act="modal-close"]');
      await G.click('[data-act="resign"]'); await G.waitForSelector('#okBtn'); await scan(G, 'hỏi xin thua'); await G.click('#okBtn');
      await G.waitForSelector('#modal:not([hidden])[data-kind="end"]');
      const end = await G.textContent('#modalCard');
      ok(/You lost/.test(end) && /Black resigned/.test(end) && /move/.test(end), `${eng} EN kết thúc ván ${end.slice(0, 80)}`);
      await scan(G, 'kết thúc ván'); await shot(G, 'en-ket-thuc-320');
      await G.evaluate(() => document.querySelector('#langBtn').click()); await sleep(100);
      ok(/Bạn thua rồi/.test(await G.textContent('#modalCard')) && /^[A-Z][a-z]?[0-9tgs][.\/-][0-9]/.test(await G.textContent('#moves .mv')), `${eng} đổi sang VI khi đang ở hộp kết thúc: dịch lại, ký hiệu nước kiểu Việt`);
      await G.evaluate(() => document.querySelector('#langBtn').click()); await sleep(100); await scan(G, 'kết thúc ván sau khi đổi lại EN');
      await G.click('#modalCard [data-act="modal-close"]'); await G.click('[data-act="leave"]'); await G.waitForSelector('#lobby:not([hidden])');
      await scan(G, 'sảnh có hộp "chơi tiếp"');
      // cờ úp với máy
      await G.click('#aiVariantSeg [data-v="jieqi"]'); await G.click('#aiBtn'); await G.waitForSelector('#game:not([hidden])');
      await G.waitForFunction(() => document.querySelectorAll('#moves .mv').length >= 1, null, { timeout: 15000 });
      const jq = await G.evaluate(() => ({ n: document.querySelector('#moves .mv').textContent, tag: document.querySelector('#roomPanel .variant-tag').textContent, badge: document.querySelector('#variantBadge b').textContent }));
      ok(/^[KAEHRCP][1-9fmr][+=-][1-9]\([KAEHRCP]\)\+?$/.test(jq.n) && jq.tag === 'Jieqi' && jq.badge === 'Jieqi', `${eng} EN cờ úp với máy: nước lật quân "(X)" theo chữ tiếng Anh ${JSON.stringify(jq)}`);
      await scan(G, 'cờ úp với máy'); await lay(G, 'cờ úp với máy 320');
      await G.click('#roomPanel [data-act="jqrules"]'); await G.waitForSelector('.jq-rules'); await scan(G, 'luật cờ úp trong ván'); await G.click('#modalCard [data-act="modal-close"]');
      await G.click('[data-act="leave"]');
      ok(G.errs.length === 0, `${eng} EN khách: không lỗi JS ${G.errs.join('|')}`);

      // ---------- Đã đăng nhập: A (EN, 320) + B (VI, 390) ----------
      const A = await mk(U1.id, 320, 568), B = await mk(U2.id, 390, 844, 'vi-VN');
      await A.waitForSelector('#inboxBtn:not([hidden])'); await A.waitForSelector('#livePanel:not([hidden])');
      await scan(A, 'sảnh đã đăng nhập 320'); await lay(A, 'sảnh đã đăng nhập 320'); await shot(A, 'en-sanh-dang-nhap-320');
      ok(/Your Xiangqi Elo: 1234/.test(await A.textContent('#mmNote')) && /Wins 5/.test(await A.textContent('#account')), `${eng} EN khung tài khoản + Elo`);
      await A.click('.acc-avatar'); await A.waitForSelector('#modalCard .pc-elo');
      const own = await A.textContent('#modalCard');
      ok(/Signed in with Google/.test(own) && /7 rated games/.test(own) && /1 rated game(?!s)/.test(own) && /Joined/.test(own) && /Sep/.test(own) === false, `${eng} EN thẻ của mình ${own.slice(0, 120)}`);
      await scan(A, 'thẻ của mình'); ok(await modalFits(A), `${eng} EN thẻ vừa 320`); await shot(A, 'en-the-nguoi-choi-320');
      await A.click('#modalCard [data-act="inbox"]'); await A.waitForSelector('#dmConvs .dm-empty:not(:empty), #dmConvs .dm-conv'); await sleep(200);
      // lượt trình duyệt đầu: hộp thư trống; lượt sau đã có tin từ lượt trước (cùng tài khoản thử)
      if (eng === ENGINES[0]) ok(/No messages yet/.test(await A.textContent('#dmConvs')), `${eng} EN hộp thư trống`); await scan(A, 'hộp thư trống');
      await A.click('#modalCard [data-act="modal-close"]');
      // ghép trận: A tìm trước (thấy trạng thái đang tìm), B tìm sau
      await A.click('#mmBtn'); await A.waitForSelector('#mmSearching:not([hidden])'); await sleep(300);
      ok(/Looking for an opponent/.test(await A.textContent('#mmSearching')) && /Xiangqi · Elo 1234 · within ±100/.test(await A.textContent('#mmInfo')), `${eng} EN đang tìm đối thủ ${await A.textContent('#mmInfo')}`);
      await scan(A, 'đang tìm đối thủ'); await lay(A, 'đang tìm đối thủ 320');
      await B.click('#mmBtn');
      const tA = await A.waitForSelector('.toast.clickable', { timeout: 8000 }).catch(() => null);
      const tAtxt = tA ? await tA.textContent() : '';
      ok(/Opponent found: Lan \(Elo 1200\) – Xiangqi, you play (Red|Black)/.test(tAtxt), `${eng} EN thông báo ghép trận "${tAtxt}"`);
      await scan(A, 'thông báo ghép trận');
      const tB = await B.waitForSelector('.toast.clickable', { timeout: 8000 }).catch(() => null);
      ok(tB && /Đã tìm thấy đối thủ: Huy/.test(await tB.textContent()), `${eng} VI (người kia) vẫn nhận thông báo tiếng Việt`);
      await A.waitForSelector('#game:not([hidden])'); await B.waitForSelector('#game:not([hidden])'); await sleep(500);
      ok(/Rated/i.test(await A.textContent('#variantBadge')) || /Rated/.test(await A.textContent('#roomPanel')), `${eng} EN ván xếp hạng`);
      await scan(A, 'ván xếp hạng 320'); await lay(A, 'ván xếp hạng 320 (đã đăng nhập)'); await shot(A, 'en-van-xep-hang-320');
      // chat từ B -> thông báo tin nhắn trên A (EN)
      await B.click('#chatTab'); await B.fill('#chatInput', 'hello there'); await B.press('#chatInput', 'Enter');
      await A.waitForSelector('#chatToast:not([hidden])', { timeout: 5000 }).catch(() => null);
      ok(/Lan · (Red|Black)/.test(await A.textContent('#ctName')), `${eng} EN thông báo chat "${await A.textContent('#ctName')}"`);
      await scan(A, 'thông báo chat');
      // B cầu hoà -> A thấy hộp EN, từ chối -> B thấy thông báo tiếng Việt, A thấy... (không gửi cho chính mình)
      await B.click('[data-act="draw"]');
      await A.waitForSelector('#modal:not([hidden])[data-kind="offer"]', { timeout: 5000 });
      ok(/Offers a draw/.test(await A.textContent('#modalCard')), `${eng} EN hộp lời mời hoà`); await scan(A, 'lời mời hoà');
      await A.click('#modalCard [data-act="decline"]');
      const tbDecl = await B.waitForSelector('.toast:has-text("từ chối")', { timeout: 5000 }).catch(() => null);
      ok(!!tbDecl && /Huy từ chối cầu hoà\./.test(await tbDecl.textContent()), `${eng} VI: thông báo từ chối bằng tiếng Việt`);
      // thẻ đối thủ -> nhắn tin
      await A.click('#barTop [data-act="pcard"]'); await A.waitForSelector('#modalCard [data-act="dm-open"]');
      await scan(A, 'thẻ đối thủ'); await A.click('#modalCard [data-act="dm-open"]'); await A.waitForSelector('#dmInput');
      await A.waitForFunction(() => /Say hi to Lan/.test(document.querySelector('#dmList').textContent), null, { timeout: 5000 }).catch(() => null);
      if (eng === ENGINES[0]) ok(/Say hi to Lan/.test(await A.textContent('#dmList')), `${eng} EN luồng tin nhắn trống`); // lượt sau đã có tin của lượt trước
      await scan(A, 'luồng tin nhắn'); ok(await modalFits(A), `${eng} EN tin nhắn vừa 320`); await shot(A, 'en-tin-nhan-320');
      await A.fill('#dmInput', 'good game'); await A.click('#dmSend');
      await A.waitForSelector('#dmList .dm-msg', { timeout: 5000 });
      const dmB = await B.waitForSelector('.dm-toast', { timeout: 5000 }).catch(() => null);
      ok(!!dmB && /Huy/.test(await dmB.textContent()), `${eng} B nhận thông báo tin nhắn riêng`);
      await A.click('#modalCard [data-act="modal-close"]');
      // B xin thua -> A thắng (EN) + dòng Elo
      await B.click('[data-act="resign"]'); await B.click('#okBtn');
      await A.waitForSelector('#modal:not([hidden])[data-kind="end"]', { timeout: 8000 });
      await A.waitForFunction(() => !/Updating/.test(document.querySelector('#modalCard').textContent), null, { timeout: 5000 }).catch(() => null);
      const endA = await A.textContent('#modalCard');
      ok(/You won!/.test(endA) && /(Red|Black) resigned/.test(endA) && /(Xiangqi Elo: 1234 → \d+|Fewer than 2 moves – Elo unchanged)/.test(endA), `${eng} EN thắng ván xếp hạng ${endA.slice(0, 110)}`);
      await scan(A, 'thắng ván xếp hạng'); await shot(A, 'en-thang-320');
      await A.click('#modalCard [data-act="modal-close"]');
      await A.click('[data-act="leave"]'); await A.waitForSelector('#lobby:not([hidden])');
      // hộp thư có cuộc trò chuyện
      await A.click('#inboxBtn'); await A.waitForSelector('#dmConvs .dm-conv'); await scan(A, 'hộp thư có tin'); await A.click('#modalCard [data-act="modal-close"]');
      // phòng tự tạo: B (VI) vào phòng của A (EN) -> A nhận thông báo server bằng tiếng Anh
      await B.click('[data-act="leave"]').catch(() => { });
      await A.click('#createBtn'); await A.waitForURL(/\/r\/[A-Z0-9]+/); const code = A.url().split('/r/')[1];
      await A.waitForSelector('#roomPanel .room-code'); await sleep(200);
      ok(/Waiting for an opponent/.test(await A.textContent('#status')) && /Room code/.test(await A.textContent('#roomPanel')), `${eng} EN phòng chờ`);
      await scan(A, 'phòng chờ'); await lay(A, 'phòng chờ 320');
      await B.goto(BASE + '/r/' + code, { waitUntil: 'networkidle' });
      const tj = await A.waitForSelector('.toast:has-text("joined the room")', { timeout: 5000 }).catch(() => null);
      ok(!!tj && /Lan joined the room \(Black\)/.test(await tj.textContent()), `${eng} EN thông báo server "người vào phòng" dịch theo ngôn ngữ người xem`);
      await scan(A, 'thông báo vào phòng');
      // phòng không tồn tại
      await A.goto(BASE + '/r/QQQQQQ', { waitUntil: 'networkidle' });
      const nr = await A.waitForSelector('.toast.err', { timeout: 5000 }).catch(() => null);
      ok(!!nr && /Room not found/.test(await nr.textContent()), `${eng} EN lỗi server "không tìm thấy phòng"`);
      await scan(A, 'lỗi phòng không tồn tại');
      // 375 trong ván, đã đăng nhập (thanh trên chật nhất: nhãn + ủng hộ + tin nhắn + VI/EN + âm thanh)
      for (const [w, h] of [[375, 667], [390, 844], [844, 390], [1280, 800]]) {
        const P = await mk(U1.id, w, h); await P.click('#aiBtn'); await P.waitForSelector('#game:not([hidden])'); await sleep(300);
        await lay(P, `ván với máy ${w}x${h} (đã đăng nhập)`); await scan(P, `ván ${w}x${h}`);
        await P.click('[data-act="leave"]'); await P.waitForSelector('#lobby:not([hidden])'); await lay(P, `sảnh ${w}x${h} (đã đăng nhập)`);
      }
      ok(A.errs.length === 0 && B.errs.length === 0, `${eng} không lỗi JS ${A.errs.concat(B.errs).join('|')}`);
      for (const c of ctxs) await c.close().catch(() => { });
      await b.close();
    }
  } catch (e) { console.error(e); fails++; }
  finally { srv.kill(); }
  console.log(`\n${checks - fails}/${checks} kiểm tra đạt` + (fails ? ` – ${fails} LỖI` : ''));
  process.exit(fails ? 1 : 0);
})();
