/* SEO + xem trước khi chia sẻ: robots.txt, sitemap.xml, thẻ <head> cho trang chủ (vi / ?lang=en) và link phòng /r/MÃ.
   Trang chủ tĩnh (public/index.html) đã có sẵn thẻ tiếng Việt cho https://cotuongvn.net; ở đây chỉ thay giá trị khi cần. */
'use strict';
const fs = require('fs');
const path = require('path');
const I18N = require('../public/i18n.js');

const DEFAULT_BASE = 'https://cotuongvn.net';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const INDEX = path.join(PUBLIC_DIR, 'index.html');

function baseUrl(env) {
  try { const u = new URL(String(env.PUBLIC_URL || '').trim()); if (u.protocol === 'https:' || u.protocol === 'http:') return (u.origin + u.pathname).replace(/\/+$/, ''); } catch { }
  return DEFAULT_BASE;
}
const escAttr = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escXml = escAttr;

// Đọc index.html (có cache theo mtime để sửa file khi đang chạy vẫn thấy ngay)
let cache = { mtime: 0, html: '' };
function indexTemplate() {
  const m = fs.statSync(INDEX).mtimeMs;
  if (m !== cache.mtime) cache = { mtime: m, html: fs.readFileSync(INDEX, 'utf8') };
  return cache.html;
}

/** Thay giá trị các thẻ meta có sẵn trong index.html; chỉ đổi khoá được truyền vào. */
function setHead(html, o) {
  const attr = (re, v) => { if (v != null) html = html.replace(re, (m0, a) => a + escAttr(v) + '"'); };
  if (o.lang) html = html.replace(/<html lang="[^"]*">/, `<html lang="${o.lang}">`);
  if (o.title != null) html = html.replace(/<title>[^<]*<\/title>/, `<title>${escAttr(o.title)}</title>`);
  attr(/(<meta name="description" content=")[^"]*"/, o.desc);
  attr(/(<meta name="robots" content=")[^"]*"/, o.robots);
  attr(/(<link rel="canonical" href=")[^"]*"/, o.canonical);
  attr(/(<meta property="og:title" content=")[^"]*"/, o.ogTitle);
  attr(/(<meta name="twitter:title" content=")[^"]*"/, o.ogTitle);
  attr(/(<meta property="og:description" content=")[^"]*"/, o.ogDesc);
  attr(/(<meta name="twitter:description" content=")[^"]*"/, o.ogDesc);
  attr(/(<meta property="og:url" content=")[^"]*"/, o.url);
  attr(/(<meta property="og:locale" content=")[^"]*"/, o.locale);
  attr(/(<meta property="og:locale:alternate" content=")[^"]*"/, o.altLocale);
  return html;
}

function createSeo({ env = process.env, rooms } = {}) {
  const BASE = baseUrl(env);
  const withBase = html => BASE === DEFAULT_BASE ? html : html.split(DEFAULT_BASE).join(BASE);
  const en = I18N.dict.en;

  function home(lang) {
    const html = withBase(indexTemplate());
    if (lang !== 'en') return html;
    return setHead(html, {
      lang: 'en', title: en['title.home'], desc: en['meta.desc'], canonical: BASE + '/?lang=en', url: BASE + '/?lang=en',
      ogTitle: 'Xiangqi & Jieqi Online – Play Free', ogDesc: 'Free Xiangqi (Chinese chess) in your browser: play the computer at 5 levels, Jieqi (hidden pieces) online, invite friends with a link. Nothing to install.',
      locale: 'en_US', altLocale: 'vi_VN',
    });
  }

  /** Link mời /r/MÃ: tiêu đề "Mời bạn vào phòng cờ …" (Facebook / Zalo / Messenger không chạy JS nên cần thẻ từ server). */
  function roomMeta(id) {
    const code = /^[A-Za-z0-9]{4,12}$/.test(id) ? id.toUpperCase() : '';
    const room = code && rooms ? rooms.get(code) : null;
    const v = room && room.variant === 'jieqi' ? 'cờ úp' : 'cờ tướng';
    const host = room ? ['r', 'b'].map(c => room.seats[c] && room.seats[c].name).find(Boolean) : '';
    const tc = room && room.timeControl ? ` · ⏱ ${Math.round(room.timeControl.base / 60000)} phút${room.timeControl.inc ? ' + ' + room.timeControl.inc / 1000 + 's' : ''}` : '';
    const title = code ? `Mời bạn vào phòng ${room ? v : 'cờ'} ${code}` : 'Mời bạn vào phòng cờ tướng online';
    const ogTitle = host ? `${host} mời bạn vào phòng ${v} ${code}` : title;
    const ogDesc = (room ? `Phòng ${v}${tc}${host ? ' – ' + host + ' đang chờ' : ''}. ` : '') +
      'Bấm link để vào chơi ngay trên điện thoại hoặc máy tính – miễn phí, không cần cài đặt.';
    return { title: title + ' – Cờ Tướng Online', ogTitle, ogDesc, desc: ogDesc, url: BASE + '/r/' + (code || encodeURIComponent(id)), robots: 'noindex, follow' };
  }
  function room(id) { const m = roomMeta(id); return setHead(withBase(indexTemplate()), { ...m, canonical: m.url }); }

  function robots() { return `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`; }

  // trang chủ + trang pháp lý, mỗi trang kèm bản ngôn ngữ còn lại (hreflang)
  const PAIRS = [
    ['/', '/?lang=en', 'index.html', 'index.html', 'daily', '1.0'],
    ['/chinh-sach-bao-mat', '/en/privacy', 'chinh-sach-bao-mat.html', 'en/privacy.html', 'monthly', '0.3'],
    ['/dieu-khoan', '/en/terms', 'dieu-khoan.html', 'en/terms.html', 'monthly', '0.3'],
    ['/xoa-du-lieu', '/en/data-deletion', 'xoa-du-lieu.html', 'en/data-deletion.html', 'monthly', '0.3'],
  ];
  const lastmod = f => { try { return fs.statSync(path.join(PUBLIC_DIR, f)).mtime.toISOString().slice(0, 10); } catch { return null; } };
  function sitemap() {
    const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
    for (const [vi, enP, fvi, fen, freq, prio] of PAIRS) {
      for (const [loc, f] of [[vi, fvi], [enP, fen]]) {
        const lm = lastmod(f);
        out.push('  <url>', `    <loc>${escXml(BASE + loc)}</loc>`, ...(lm ? [`    <lastmod>${lm}</lastmod>`] : []), `    <changefreq>${freq}</changefreq>`, `    <priority>${loc === enP ? (prio === '1.0' ? '0.8' : prio) : prio}</priority>`,
          `    <xhtml:link rel="alternate" hreflang="vi" href="${escXml(BASE + vi)}"/>`, `    <xhtml:link rel="alternate" hreflang="en" href="${escXml(BASE + enP)}"/>`,
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${escXml(BASE + vi)}"/>`, '  </url>');
      }
    }
    out.push('</urlset>', '');
    return out.join('\n');
  }
  return { BASE, home, room, roomMeta, robots, sitemap };
}

module.exports = { createSeo, setHead, baseUrl, DEFAULT_BASE };
