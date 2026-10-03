/* Đăng nhập Google / Facebook (OAuth 2.0 authorization code flow, dùng fetch – không cần passport)
   + phiên đăng nhập bằng cookie ký HMAC (httpOnly, sameSite=lax, secure khi chạy https).
   Thiếu biến môi trường của nhà cung cấp nào thì nút của nhà cung cấp đó bị ẩn; khách vẫn chơi bình thường. */
'use strict';
const Rating = require('./rating');
const crypto = require('crypto');
const express = require('express');

const SESSION_COOKIE = 'ct_session', OAUTH_COOKIE = 'ct_oauth';
const SESSION_DAYS = 30, OAUTH_TTL_MS = 10 * 60 * 1000;
const b64u = buf => Buffer.from(buf).toString('base64url');

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(part => {
    const i = part.indexOf('='); if (i < 0) return;
    const k = part.slice(0, i).trim(); if (!k || out[k] !== undefined) return;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { out[k] = part.slice(i + 1).trim(); }
  });
  return out;
}
function safeNext(n) {
  n = String(n || '');
  return /^\/(?![\/\\])[\w\-\/.~%?=&]*$/.test(n) && n.length < 200 ? n : '/';
}

function createAuth(opts) {
  const env = opts.env || process.env, store = opts.store, log = opts.log || console;
  const doFetch = opts.fetch || globalThis.fetch;
  let secret = env.SESSION_SECRET;
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    if (env.GOOGLE_CLIENT_ID || env.FACEBOOK_APP_ID) log.warn('[auth] Chưa đặt SESSION_SECRET – dùng khoá tạm, mọi người sẽ bị đăng xuất khi server khởi động lại.');
  }
  const publicUrl = (env.PUBLIC_URL || '').replace(/\/+$/, '');
  const fbVer = env.FACEBOOK_GRAPH_VERSION || 'v26.0';
  const P = {
    google: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {
      id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET,
      authUrl: env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
      userUrl: env.GOOGLE_USERINFO_URL || 'https://openidconnect.googleapis.com/v1/userinfo',
    } : null,
    facebook: env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET ? {
      id: env.FACEBOOK_APP_ID, secret: env.FACEBOOK_APP_SECRET,
      authUrl: env.FACEBOOK_AUTH_URL || `https://www.facebook.com/${fbVer}/dialog/oauth`,
      tokenUrl: env.FACEBOOK_TOKEN_URL || `https://graph.facebook.com/${fbVer}/oauth/access_token`,
      userUrl: env.FACEBOOK_ME_URL || `https://graph.facebook.com/${fbVer}/me`,
    } : null,
  };
  const providers = { google: !!P.google, facebook: !!P.facebook };

  // ---- cookie ký ----
  const sign = data => crypto.createHmac('sha256', secret).update(data).digest('base64url');
  function seal(obj) { const d = b64u(JSON.stringify(obj)); return d + '.' + sign(d); }
  function unseal(v) {
    if (typeof v !== 'string') return null;
    const i = v.lastIndexOf('.'); if (i < 1) return null;
    const d = v.slice(0, i), s = v.slice(i + 1), e = sign(d);
    if (s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null;
    try { const o = JSON.parse(Buffer.from(d, 'base64url').toString('utf8')); return o && o.exp > Date.now() ? o : null; } catch (er) { return null; }
  }
  const isSecure = req => publicUrl ? publicUrl.startsWith('https://') : !!req.secure;
  function setCookie(req, res, name, value, maxAgeMs, pathName) {
    res.cookie(name, value, { httpOnly: true, sameSite: 'lax', secure: isSecure(req), path: pathName || '/', maxAge: maxAgeMs });
  }
  function clearCookie(req, res, name, pathName) {
    res.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure: isSecure(req), path: pathName || '/' });
  }
  const baseUrl = req => publicUrl || (req.protocol + '://' + req.get('host'));
  const redirectUri = (req, p) => baseUrl(req) + '/auth/' + p + '/callback';

  function sessionUserId(cookieHeader) {
    const s = unseal(parseCookies(cookieHeader)[SESSION_COOKIE]);
    return s && typeof s.uid === 'string' ? s.uid : null;
  }
  async function userFromCookieHeader(cookieHeader) {
    const id = sessionUserId(cookieHeader); if (!id) return null;
    try { return await store.getUser(id); } catch (e) { log.error('[auth] getUser', e.message); return null; }
  }
  const publicUser = u => u ? { id: u.id, provider: u.provider, name: u.name, avatar: u.avatar || '', wins: u.wins | 0, losses: u.losses | 0, draws: u.draws | 0, createdAt: u.createdAt, ratings: Rating.normalizeRatings(u.ratings) } : null;

  async function getJson(url, init) {
    const r = await doFetch(url, { ...init, signal: AbortSignal.timeout(10000) });
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) { }
    if (!r.ok || !j) throw new Error('HTTP ' + r.status + ' ' + url.split('?')[0] + ' ' + txt.slice(0, 200));
    return j;
  }
  // Đổi code lấy hồ sơ người dùng: {providerId, name, avatar}
  const PROFILE = {
    async google(req, code, st) {
      const tok = await getJson(P.google.tokenUrl, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ code, client_id: P.google.id, client_secret: P.google.secret, redirect_uri: redirectUri(req, 'google'),
          grant_type: 'authorization_code', code_verifier: st.v }).toString(),
      });
      if (!tok.access_token) throw new Error('Google không trả access_token');
      const u = await getJson(P.google.userUrl, { headers: { authorization: 'Bearer ' + tok.access_token, accept: 'application/json' } });
      if (!u.sub) throw new Error('Google userinfo thiếu sub');
      return { providerId: String(u.sub), name: u.name || u.given_name || '', avatar: u.picture || '' };
    },
    async facebook(req, code) {
      const q = new URLSearchParams({ client_id: P.facebook.id, client_secret: P.facebook.secret, redirect_uri: redirectUri(req, 'facebook'), code });
      const tok = await getJson(P.facebook.tokenUrl + '?' + q, { headers: { accept: 'application/json' } });
      if (!tok.access_token) throw new Error('Facebook không trả access_token');
      const proof = crypto.createHmac('sha256', P.facebook.secret).update(tok.access_token).digest('hex');
      const mq = new URLSearchParams({ fields: 'id,name,picture.width(200).height(200)', access_token: tok.access_token, appsecret_proof: proof });
      const u = await getJson(P.facebook.userUrl + '?' + mq, { headers: { accept: 'application/json' } });
      if (!u.id) throw new Error('Facebook /me thiếu id');
      const pic = u.picture && u.picture.data && !u.picture.data.is_silhouette ? u.picture.data.url : '';
      return { providerId: String(u.id), name: u.name || '', avatar: pic || '' };
    },
  };

  const router = express.Router();
  router.get('/api/me', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const u = await userFromCookieHeader(req.headers.cookie);
    res.json({ user: publicUser(u), providers });
  });

  router.get('/auth/:provider(google|facebook)', (req, res) => {
    const p = req.params.provider;
    if (!P[p]) return res.redirect('/?login_error=' + p);
    const state = b64u(crypto.randomBytes(18)), verifier = b64u(crypto.randomBytes(32));
    setCookie(req, res, OAUTH_COOKIE, seal({ p, s: state, v: verifier, n: safeNext(req.query.next), exp: Date.now() + OAUTH_TTL_MS }), OAUTH_TTL_MS, '/auth');
    const q = new URLSearchParams({ client_id: P[p].id, redirect_uri: redirectUri(req, p), response_type: 'code', state });
    if (p === 'google') {
      q.set('scope', 'openid profile'); q.set('prompt', 'select_account');
      q.set('code_challenge', b64u(crypto.createHash('sha256').update(verifier).digest())); q.set('code_challenge_method', 'S256');
    } else q.set('scope', 'public_profile');
    res.redirect(P[p].authUrl + '?' + q);
  });

  router.get('/auth/:provider(google|facebook)/callback', async (req, res) => {
    const p = req.params.provider, fail = (why) => {
      log.warn('[auth] đăng nhập ' + p + ' thất bại: ' + why);
      clearCookie(req, res, OAUTH_COOKIE, '/auth');
      res.redirect('/?login_error=' + p);
    };
    if (!P[p]) return fail('chưa cấu hình');
    const st = unseal(parseCookies(req.headers.cookie)[OAUTH_COOKIE]);
    if (req.query.error) return fail('người dùng huỷ / lỗi: ' + String(req.query.error).slice(0, 80));
    if (!st || st.p !== p || typeof req.query.state !== 'string' || req.query.state !== st.s) return fail('state không khớp');
    if (typeof req.query.code !== 'string' || !req.query.code) return fail('thiếu code');
    try {
      const prof = await PROFILE[p](req, req.query.code, st);
      const user = await store.upsertOAuthUser({ provider: p, ...prof });
      clearCookie(req, res, OAUTH_COOKIE, '/auth');
      setCookie(req, res, SESSION_COOKIE, seal({ uid: user.id, exp: Date.now() + SESSION_DAYS * 864e5 }), SESSION_DAYS * 864e5);
      res.redirect(safeNext(st.n));
    } catch (e) { fail(e.message); }
  });

  router.post('/auth/logout', (req, res) => {
    const origin = req.get('origin');
    if (origin && origin !== baseUrl(req) && origin !== req.protocol + '://' + req.get('host')) return res.status(403).json({ ok: false });
    clearCookie(req, res, SESSION_COOKIE);
    res.set('Cache-Control', 'no-store').json({ ok: true });
  });

  return { router, providers, userFromCookieHeader, sessionUserId, publicUser, parseCookies, safeNext };
}

module.exports = { createAuth, parseCookies, safeNext, SESSION_COOKIE };
