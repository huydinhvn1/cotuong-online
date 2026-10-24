# Cờ Tướng – máy chủ cho https://huydinh.app/cotuong/

Trang game nằm trên Netlify (huydinh.app/cotuong). Máy chủ này (Render: cotuong-online, địa chỉ https://api.huydinh.app) chỉ còn:
- WebSocket `/hd`: ghép bàn tự động theo mức thời gian WXF (tiêu chuẩn 60'+30" mặc định, nhanh 10'+5", chớp 5'+3"), đi quân kiểm tra ở server (`shared/xiangqi.js`), chat, tín hiệu mic WebRTC, ảnh đại diện, khán giả, vào lại ghế, cầu hoà, xin thua.
- Đăng nhập Google (`/auth/hd/start`) + lưu câu nói nhanh/tên/ảnh theo tài khoản (Postgres `cotuong_users`, `cotuong_hd_prefs`).
- Trang pháp lý `/privacy`, `/terms`, `/data-deletion`. Mọi đường dẫn khác 301 về trang game. Trang cotuongvn.net cũ đã bỏ.

Biến môi trường: `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, tuỳ chọn `API_PUBLIC_URL` (vd https://api.huydinh.app; không đặt thì theo Host), `GAME_URL`, `HD_ORIGINS`. `PUBLIC_URL` cũ không còn dùng.

```bash
npm install && npm test && npm start
```
