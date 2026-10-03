# Cờ Tướng Online ♟️

Web app cờ tướng: chơi online với bạn bè qua link phòng, có khán giả xem, trò chuyện, đồng hồ, và chế độ chơi với máy (5 cấp độ).

## Chạy trên máy

Yêu cầu: **Node.js 18+**

```bash
npm install
npm start          # mở http://localhost:3000
npm test           # chạy kiểm thử (luật cờ, AI, server WebSocket)
# Kiểm thử trình duyệt (cần playwright-core + Chromium/WebKit):
# node scripts/check-viewport.js     – bố cục di động (server đang chạy ở :3000)
# node scripts/check-chat-notify.js  – thông báo tin nhắn giữa 2 người chơi + khán giả
```

Đổi cổng: `PORT=8080 npm start`

## Tính năng

- **Đầy đủ luật cờ tướng**, kiểm tra cả ở server lẫn trình duyệt: Tướng/Sĩ trong cung, Tượng không qua sông + cản mắt, Mã cản chân, Pháo cần ngòi, Tốt qua sông được đi ngang, luật lộ mặt tướng, không được tự đi vào thế bị chiếu, chiếu bí, hết nước đi = thua.
  Hoà khi: hai bên đồng ý, lặp lại thế cờ 3 lần (đơn giản hoá), 120 nước liên tiếp không ăn quân, hoặc không còn quân tấn công.
  Cấm chiếu dai: trong chuỗi chiếu liên tục, nước chiếu tạo lại một thế cờ lần thứ 3 bị từ chối ("Không được chiếu lặp lại – hãy đổi nước"); chiếu bí luôn được đi; bên chiếu không còn nước nào khác thì thua. Lặp thế cờ không do chiếu dai vẫn xử hoà.
- **Chơi online**: tạo phòng → gửi link `/r/MÃPHÒNG` hoặc mã 6 ký tự. Người thứ 2 vào là đối thủ, người sau vào xem. Chọn Đỏ/Đen/Ngẫu nhiên.
- Xin đi lại, cầu hoà, xin thua, ván mới (tự đổi màu), chat trong phòng.
- Thông báo tin nhắn mới: banner nổi trên bàn cờ (chạm để mở Trò chuyện), số tin chưa đọc trên tab và nút chat nổi (điện thoại), âm báo nhẹ (theo nút tắt tiếng), rung, tiêu đề tab `(N) Tin nhắn mới` khi đang ở tab khác.
- **Đồng hồ** mỗi bên (5/10/15/30 phút, có thể cộng giờ mỗi nước). Đồng hồ chạy từ sau nước đầu tiên.
- **F5 / mất mạng không mất ván**: trạng thái phòng giữ trên server, trình duyệt tự kết nối lại và giữ đúng ghế.
- **Chơi với máy**: AI alpha-beta (iterative deepening, quiescence, bảng điểm vị trí) chạy trong Web Worker. Có gợi ý nước đi, đi lại, ván tự lưu.
- Ký hiệu nước đi kiểu Việt Nam: `P2-5` (bình), `M8.7` (tiến), `X1/2` (thoái), `Xt.1` / `Xs-8` (quân trước/sau).
- Giao diện: bàn gỗ, sông 楚河 漢界 (Sở Hà – Hán Giới), quân tròn chữ Hán, đánh dấu nước vừa đi, chấm nước đi hợp lệ, cảnh báo chiếu tướng, kéo-thả hoặc bấm để đi, âm thanh (bật/tắt), lật bàn, hỗ trợ điện thoại.

## Cấu trúc

```
server.js            Server Express + WebSocket (ws), quản lý phòng trong bộ nhớ
shared/xiangqi.js    Bộ luật (dùng chung server + trình duyệt)
shared/ai.js         AI (alpha-beta)
public/              Giao diện (HTML/CSS/JS thuần, không cần build)
test/                Kiểm thử: node --test
```

## Đưa lên Internet (deploy)

Phòng chơi lưu **trong bộ nhớ**, nên chỉ chạy **1 instance** (khởi động lại server sẽ mất các phòng đang chơi).

### Render.com (miễn phí)
1. Đưa mã nguồn lên GitHub.
2. Render → **New → Web Service** → chọn repo.
3. Build command: `npm install` · Start command: `npm start` · Instance: Free.
4. Render tự cấp biến `PORT`, WebSocket chạy sẵn. Gói free sẽ "ngủ" sau 15 phút không dùng.

### Railway
1. **New Project → Deploy from GitHub repo**.
2. Railway tự nhận `npm start`. Vào **Settings → Networking → Generate Domain**.

### Fly.io (dùng Dockerfile có sẵn)
```bash
fly launch        # chọn region gần (vd: sin – Singapore), không cần database
fly deploy
fly scale count 1 # giữ 1 máy vì phòng lưu trong bộ nhớ
```

### Chia sẻ nhanh từ máy cá nhân
```bash
npm start
npx localtunnel --port 3000
# hoặc: cloudflared tunnel --url http://localhost:3000
```

## Ghi chú
- Đã áp dụng luật cấm "trường chiếu" (chiếu dai); luật "trường bắt" (đuổi bắt dai) chưa áp dụng – lặp thế cờ do đuổi bắt vẫn xử hoà 3 lần.
- Font chữ Hán dùng LXGW WenKai TC (Google Fonts), có font dự phòng của hệ thống.
