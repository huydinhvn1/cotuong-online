/* Đăng nhập Google cho https://huydinh.app/cotuong/ (OAuth 2.0 authorization code + PKCE, dùng fetch).
   Trang game (khác nguồn) mở popup /auth/hd/start -> Google -> /auth/google/callback -> /auth/hd/done, trang done gửi
   mã ký 30 ngày qua postMessage cho các nguồn trong HD_ORIGINS; trang gửi mã đó qua WebSocket /hd (login).
   Địa chỉ gọi lại = API_PUBLIC_URL (vd https://api.huydinh.app) hoặc, nếu không đặt, theo Host của yêu cầu. */
'use strict';
const crypto = require('crypto');
const express = require('express');

const SESSION_COOKIE = 'ct_session', OAUTH_COOKIE = 'ct_oauth';
const SESSION_DAYS = 30, OAUTH_TTL_MS = 10 * 60 * 1000, HD_TTL = 30 * 864e5;
const DEFAULT_ORIGINS = 'https://huydinh.app,https://www.huydinh.app,https://huydinh.info,https://www.huydinh.info';
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
const parseOrigins = s => String(s || DEFAULT_ORIGINS).split(',').map(x => x.trim().replace(/\/+$/, '')).filter(Boolean);

function createAuth(opts) {
  const env = opts.env || process.env, store = opts.store, log = opts.log || console;
  const doFetch = opts.fetch || globalThis.fetch;
  let secret = env.SESSION_SECRET;
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    if (env.GOOGLE_CLIENT_ID) log.warn('[auth] Chưa đặt SESSION_SECRET – dùng khoá tạm, mọi người sẽ bị đăng xuất khi server khởi động lại.');
  }
  const publicUrl = String(env.API_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const gameUrl = env.GAME_URL || 'https://huydinh.app/cotuong/';
  const HD_ORIGINS = parseOrigins(env.HD_ORIGINS);
  const G = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {
    id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET,
    authUrl: env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
    userUrl: env.GOOGLE_USERINFO_URL || 'https://openidconnect.googleapis.com/v1/userinfo',
  } : null;

  const sign = d => crypto.createHmac('sha256', secret).update(d).digest('base64url');
  function seal(obj) { const d = b64u(JSON.stringify(obj)); return d + '.' + sign(d); }
  function unseal(v) {
    if (typeof v !== 'string') return null;
    const i = v.lastIndexOf('.'); if (i < 1) return null;
    const d = v.slice(0, i), s = v.slice(i + 1), e = sign(d);
    if (s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null;
    try { const o = JSON.parse(Buffer.from(d, 'base64url').toString('utf8')); return o && o.exp > Date.now() ? o : null; } catch (er) { return null; }
  }
  const baseUrl = req => publicUrl || (req.protocol + '://' + req.get('host'));
  const isSecure = req => baseUrl(req).startsWith('https://');
  const setCookie = (req, res, name, value, maxAge, p) => res.cookie(name, value, { httpOnly: true, sameSite: 'lax', secure: isSecure(req), path: p || '/', maxAge });
  const clearCookie = (req, res, name, p) => res.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure: isSecure(req), path: p || '/' });
  const redirectUri = req => baseUrl(req) + '/auth/google/callback';
  function sessionUserId(cookieHeader) { const s = unseal(parseCookies(cookieHeader)[SESSION_COOKIE]); return s && typeof s.uid === 'string' ? s.uid : null; }
  function hdUserId(token) { const o = unseal(token); return o && o.hd === 1 && typeof o.uid === 'string' ? o.uid : null; }

  async function getJson(url, init) {
    const r = await doFetch(url, { ...init, signal: AbortSignal.timeout(10000) });
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) { }
    if (!r.ok || !j) throw new Error('HTTP ' + r.status + ' ' + url.split('?')[0] + ' ' + txt.slice(0, 200));
    return j;
  }

  const router = express.Router();
  router.get(['/auth/hd/start', '/auth/google'], (req, res) => {
    if (req.path === '/auth/hd/start' && sessionUserId(req.headers.cookie)) return res.redirect('/auth/hd/done');
    if (!G) return res.status(503).type('text').send('Chưa cấu hình đăng nhập Google');
    const state = b64u(crypto.randomBytes(18)), verifier = b64u(crypto.randomBytes(32));
    setCookie(req, res, OAUTH_COOKIE, seal({ s: state, v: verifier, exp: Date.now() + OAUTH_TTL_MS }), OAUTH_TTL_MS, '/auth');
    const q = new URLSearchParams({ client_id: G.id, redirect_uri: redirectUri(req), response_type: 'code', state, scope: 'openid profile email', prompt: 'select_account',
      code_challenge: b64u(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' });
    res.redirect(G.authUrl + '?' + q);
  });
  router.get('/auth/google/callback', async (req, res) => {
    const fail = why => { log.warn('[auth] đăng nhập google thất bại: ' + why); clearCookie(req, res, OAUTH_COOKIE, '/auth'); res.redirect('/auth/hd/done'); };
    if (!G) return fail('chưa cấu hình');
    const st = unseal(parseCookies(req.headers.cookie)[OAUTH_COOKIE]);
    if (req.query.error) return fail('người dùng huỷ / lỗi: ' + String(req.query.error).slice(0, 80));
    if (!st || typeof req.query.state !== 'string' || req.query.state !== st.s) return fail('state không khớp');
    if (typeof req.query.code !== 'string' || !req.query.code) return fail('thiếu code');
    try {
      const tok = await getJson(G.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ code: req.query.code, client_id: G.id, client_secret: G.secret, redirect_uri: redirectUri(req), grant_type: 'authorization_code', code_verifier: st.v }).toString() });
      if (!tok.access_token) throw new Error('Google không trả access_token');
      const u = await getJson(G.userUrl, { headers: { authorization: 'Bearer ' + tok.access_token, accept: 'application/json' } });
      if (!u.sub) throw new Error('Google userinfo thiếu sub');
      const user = await store.upsertOAuthUser({ provider: 'google', providerId: String(u.sub), name: u.name || u.given_name || '', avatar: u.picture || '', email: u.email_verified === false ? '' : (u.email || '') });
      clearCookie(req, res, OAUTH_COOKIE, '/auth');
      setCookie(req, res, SESSION_COOKIE, seal({ uid: user.id, exp: Date.now() + SESSION_DAYS * 864e5 }), SESSION_DAYS * 864e5);
      res.redirect('/auth/hd/done');
    } catch (e) { fail(e.message); }
  });
  router.get('/auth/hd/done', (req, res) => {
    const uid = sessionUserId(req.headers.cookie);
    const token = uid ? seal({ uid, hd: 1, exp: Date.now() + HD_TTL }) : '';
    res.set('Cache-Control', 'no-store').type('html').send(`<!doctype html><meta charset="utf-8"><title>Đăng nhập</title><body style="font-family:sans-serif;text-align:center;padding:40px">
<p>${uid ? 'Đăng nhập thành công, đang quay lại trò chơi…' : 'Đăng nhập không thành công.'}</p><script>(function(){var t=${JSON.stringify(token)},o=${JSON.stringify(HD_ORIGINS)},g=${JSON.stringify(gameUrl)};
if(window.opener){for(var i=0;i<o.length;i++){try{window.opener.postMessage({type:'ct_login',token:t},o[i])}catch(e){}}setTimeout(function(){window.close()},300)}else{location.replace(g+(t?'#ct_login='+encodeURIComponent(t):''))}})();</script>`);
  });
  router.post('/auth/logout', (req, res) => { clearCookie(req, res, SESSION_COOKIE); res.set('Cache-Control', 'no-store').json({ ok: true }); });

  return { router, enabled: !!G, hdUserId, sessionUserId, seal, HD_ORIGINS };
}
module.exports = { createAuth, parseCookies, parseOrigins, SESSION_COOKIE };
