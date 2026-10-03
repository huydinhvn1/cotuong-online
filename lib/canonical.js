/* Chuyển hướng 301 về tên miền chính (PUBLIC_URL), vd cotuong-online-6qpn.onrender.com/r/ABC123 -> https://cotuongvn.net/r/ABC123.
   Chỉ áp dụng cho GET/HEAD thường. Không chuyển hướng: khi chưa đặt PUBLIC_URL, yêu cầu nâng cấp WebSocket,
   localhost / 127.0.0.1 / ::1 / địa chỉ IP (máy cá nhân, kiểm tra nội bộ), và kiểm tra sức khoẻ /health của Render. */
'use strict';

const SKIP_PATHS = new Set(['/health', '/healthz']);

function parsePublicUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return { origin: u.origin, host: u.host.toLowerCase(), base: u.pathname.replace(/\/+$/, '') };
  } catch { return null; }
}

// "Host" -> tên máy (bỏ cổng, chữ thường); hỗ trợ IPv6 dạng [::1]:3000
function hostName(host) {
  const h = String(host || '').trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(1, h.indexOf(']') > 0 ? h.indexOf(']') : undefined);
  const i = h.lastIndexOf(':');
  return i > -1 && h.indexOf(':') === i ? h.slice(0, i) : h;
}
const isLocalOrIp = name => name === 'localhost' || name.endsWith('.localhost') || /^\d{1,3}(\.\d{1,3}){3}$/.test(name) || name.includes(':');
// so sánh Host, coi cổng mặc định (443/80) như không có cổng
const normHost = (h, proto) => String(h || '').trim().toLowerCase().replace(proto === 'https:' ? /:443$/ : /:80$/, '');

function canonicalRedirect(publicUrl) {
  const pub = parsePublicUrl(publicUrl);
  if (!pub) return (req, res, next) => next(); // chưa đặt PUBLIC_URL -> không làm gì
  const proto = pub.origin.startsWith('https:') ? 'https:' : 'http:';
  const target = normHost(pub.host, proto);
  return function (req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.headers.upgrade || /\bupgrade\b/i.test(req.headers.connection || '')) return next(); // WebSocket
    const host = req.headers.host;
    if (!host) return next();
    if (normHost(host, proto) === target) return next(); // đã đúng tên miền
    if (isLocalOrIp(hostName(host))) return next(); // localhost, 127.0.0.1, IP nội bộ (health check)
    const p = req.path || '/';
    if (SKIP_PATHS.has(p)) return next();
    if (/^Render\//i.test(req.headers['user-agent'] || '')) return next(); // máy kiểm tra của Render
    const url = req.originalUrl || req.url || '/'; // đường dẫn + chuỗi truy vấn
    res.set('Cache-Control', 'public, max-age=3600');
    res.redirect(301, pub.origin + pub.base + (url.startsWith('/') ? url : '/' + url));
  };
}

module.exports = { canonicalRedirect, parsePublicUrl, hostName };
