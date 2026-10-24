/* Máy chủ cho https://huydinh.app/cotuong/: WebSocket /hd (ghép bàn, đồng hồ, chat, tín hiệu mic, ảnh đại diện, khán giả)
   + đăng nhập Google + lưu câu nói nhanh/tên/ảnh theo tài khoản (Postgres). Trang web cũ cotuongvn.net đã bỏ:
   mọi đường dẫn khác chuyển 301 về GAME_URL. */
'use strict';
const path = require('path');
const http = require('http');
const express = require('express');
const { createStore } = require('./lib/store');
const { createAuth } = require('./lib/auth');
const hdLobby = require('./lib/hdlobby');

function createServer(env) {
  env = env || process.env;
  const GAME_URL = env.GAME_URL || 'https://huydinh.app/cotuong/';
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render đứng sau proxy https
  const store = createStore(env);
  const ready = store.init().catch(e => console.error('[store] không khởi tạo được kho người dùng:', e.message));
  const auth = createAuth({ env, store });
  hdLobby.init({ store, auth, ready });
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(auth.router);
  app.get(['/health', '/healthz'], (req, res) => res.json({ ok: true, ...hdLobby.counts(), uptime: process.uptime() | 0 }));
  // Trang pháp lý (màn hình xác thực OAuth của Google cần)
  const LEGAL = { '/privacy': 'chinh-sach-bao-mat.html', '/privacy-policy': 'chinh-sach-bao-mat.html', '/terms': 'dieu-khoan.html', '/data-deletion': 'xoa-du-lieu.html',
    '/chinh-sach-bao-mat': 'chinh-sach-bao-mat.html', '/dieu-khoan': 'dieu-khoan.html', '/xoa-du-lieu': 'xoa-du-lieu.html',
    '/en/privacy': 'en/privacy.html', '/en/privacy-policy': 'en/privacy.html', '/en/terms': 'en/terms.html', '/en/data-deletion': 'en/data-deletion.html' };
  for (const [p, f] of Object.entries(LEGAL)) app.get([p, p + '.html'], (req, res) => res.sendFile(path.join(__dirname, 'public', f)));
  app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'public', 'favicon.ico')));
  app.use((req, res) => req.method === 'GET' || req.method === 'HEAD' ? res.redirect(301, GAME_URL) : res.status(404).json({ error: 'not_found' }));

  const server = http.createServer(app);
  const localOrigin = o => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => { });
    const p = (req.url || '').split('?')[0], o = req.headers.origin;
    if (p !== '/hd' || (o && !auth.HD_ORIGINS.includes(o) && !localOrigin(o))) { socket.destroy(); return; }
    hdLobby.handle(req, socket, head);
  });
  return { app, server, store, auth, ready };
}

if (require.main === module) {
  process.on('uncaughtException', e => console.error('uncaught', e));
  const PORT = +process.env.PORT || 3000;
  createServer().server.listen(PORT, () => console.log('Cờ tướng (huydinh.app/cotuong) chạy ở cổng ' + PORT));
}
module.exports = { createServer };
