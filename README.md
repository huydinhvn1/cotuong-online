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
- **Cờ úp** (khi tạo phòng online hoặc chơi với máy, chọn *Kiểu cờ: Cờ úp*): Tướng ngửa ở chỗ cũ, 15 quân còn lại mỗi bên được xáo ngẫu nhiên và úp ở 15 vị trí xuất phát. Quân úp đi theo quân vốn đứng ở ô đó (ô Pháo đi như Pháo, ô Sĩ đi như Sĩ trong cung…), đi xong thì lật ngửa và từ đó đi theo mặt thật. Sĩ/Tượng đã lật được đi khắp bàn (qua sông, ra khỏi cung; Tượng vẫn bị cản mắt). Được ăn quân đang úp, quân bị ăn lộ mặt. Chiếu, chiếu bí, lộ mặt tướng, cấm chiếu dai giữ nguyên. Người vào phòng thấy kiểu cờ ở bảng phòng.
  - Online: **server giữ mặt thật** của quân úp, trình duyệt chỉ nhận mặt quân khi nó được lật hoặc bị ăn (xem bằng devtools cũng không thấy).
  - Máy chỉ dùng thông tin công khai: quân úp được tính theo giá trị kỳ vọng của các quân còn có thể nằm dưới đó; máy không nhìn mặt quân úp của bên nào.
  - Không áp dụng cho chế độ hai người một máy (bản offline).
- **Ủng hộ tác giả**: nút ❤ *Ủng hộ* ở thanh trên và link ở chân trang mở hộp hướng dẫn chuyển qua **Zelle** (email huydinhvn1@gmail.com, người nhận Huy Dinh), có nút sao chép. Trang không xử lý thanh toán; Zelle chỉ dùng được với tài khoản ngân hàng tại Mỹ.
- **Tìm đối thủ tự động + Elo** (cần đăng nhập): khung *Tìm đối thủ tự động* ở sảnh, chọn Cờ tướng hoặc Cờ úp → **Tìm đối thủ**. Server ghép hai người cùng kiểu cờ có Elo gần nhau nhất (người chờ lâu được xét trước); phạm vi chênh lệch bắt đầu ±100, nới thêm 50 mỗi 5 giây, sau 60 giây thì ghép với bất kỳ ai. Không bao giờ ghép một tài khoản với chính nó (tìm ở thẻ thứ hai thì thẻ cũ tự dừng). Khi ghép xong, server tạo phòng mới (màu quân ngẫu nhiên, 10 phút + 5 giây/nước) và đưa cả hai vào; hai bên thấy tên + Elo của nhau. Đang chờ có đồng hồ, nút **Huỷ tìm**; đóng trang/mất kết nối thì tự rời hàng đợi. Khách thấy gợi ý "Đăng nhập để tìm đối thủ tự động".
  - **Elo** riêng cho cờ tướng và cờ úp, mặc định 1200, K = 40 trong 20 ván xếp hạng đầu, sau đó K = 32. Chỉ ván trong phòng ghép trận mới tính Elo (kể cả ván mới trong cùng phòng, đổi màu); phòng tự tạo không tính Elo nhưng vẫn tính Thắng/Thua/Hoà như trước. Ván phải có ít nhất 2 nước.
  - Ván xếp hạng: người chơi mất kết nối quá 60 giây (đối thủ được báo trước) bị xử thua; nếu chưa đủ 2 nước thì ván bị huỷ, không tính điểm. Hết giờ, xin thua, hoà, chiếu bí… tính Elo như bình thường.
  - Elo hiện ở khu tài khoản trên sảnh, trên thanh tên người chơi trong ván và trong hộp kết thúc ván (vd "1200 → 1220 (+20)").
- **Tài khoản (tuỳ chọn)**: đăng nhập bằng Google hoặc Facebook để giữ tên và thống kê Thắng/Thua/Hoà. **Không bắt buộc** – khách vẫn nhập tên và chơi như cũ. Nếu server chưa cấu hình nhà cung cấp nào thì sảnh trông y như trước (không hiện khung tài khoản).
- Giao diện: bàn gỗ, sông 楚河 漢界 (Sở Hà – Hán Giới), quân tròn chữ Hán, đánh dấu nước vừa đi, chấm nước đi hợp lệ, cảnh báo chiếu tướng, kéo-thả hoặc bấm để đi, âm thanh (bật/tắt), xoay bàn, hỗ trợ điện thoại.

## Cấu trúc

```
server.js            Server Express + WebSocket (ws), quản lý phòng trong bộ nhớ
lib/auth.js          Đăng nhập Google/Facebook (OAuth code flow, cookie phiên có ký)
lib/store.js         Lưu người dùng + Elo: Postgres (DATABASE_URL) hoặc file JSON (data/users.json)
lib/rating.js        Công thức Elo (mặc định 1200, K = 40 / 32)
lib/matchmaker.js    Hàng đợi ghép trận (ưu tiên Elo gần nhất, phạm vi nới rộng theo thời gian chờ)
shared/xiangqi.js    Bộ luật cờ tướng + cờ úp (dùng chung server + trình duyệt)
shared/ai.js         AI (alpha-beta)
public/              Giao diện (HTML/CSS/JS thuần, không cần build) + 3 trang pháp lý tĩnh
test/                Kiểm thử: node --test (rating, matchmaking, store, server, auth, cờ úp…)
```

## Đăng nhập Google / Facebook (tuỳ chọn)

Mặc định (không đặt biến môi trường nào) app chạy y như cũ: ai cũng chơi với tư cách khách. Muốn bật đăng nhập, làm các bước dưới đây. Thiếu biến của nhà cung cấp nào thì nút của nhà cung cấp đó tự ẩn; khách vẫn chơi bình thường.

Địa chỉ app trên Render: `https://cotuong-online-6qpn.onrender.com`

### 1. Google (Google Cloud Console)
1. Vào https://console.cloud.google.com → tạo (hoặc chọn) một project.
2. **APIs & Services → OAuth consent screen** (giao diện mới: **Google Auth Platform → Branding / Audience**):
   - User type: **External**, điền tên app (vd "Cờ Tướng Online"), email hỗ trợ, email liên hệ.
   - **Branding → App domain**:
     - Application home page: `https://cotuong-online-6qpn.onrender.com/`
     - Application privacy policy link: `https://cotuong-online-6qpn.onrender.com/chinh-sach-bao-mat`
     - Application terms of service link: `https://cotuong-online-6qpn.onrender.com/dieu-khoan`
     - Authorized domains: `cotuong-online-6qpn.onrender.com` (không dùng `onrender.com` vì đây là tên miền công cộng – Public Suffix; nếu có tên miền riêng thì dùng tên miền đó)
     - Logo: có thể bỏ trống. Tải logo lên thường khiến Google yêu cầu xác minh thương hiệu (có thể cần chứng minh sở hữu tên miền qua Google Search Console).
   - Scopes: chỉ cần `openid` và `profile` (mặc định, không cần xác minh).
   - **Audience → Publish app** (chuyển sang *In production*) để mọi người đăng nhập được; nếu để *Testing* thì chỉ các "Test users" đã thêm mới đăng nhập được.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: `https://cotuong-online-6qpn.onrender.com`
   - **Authorized redirect URIs**: `https://cotuong-online-6qpn.onrender.com/auth/google/callback`
   - (Chạy thử trên máy thì thêm: origin `http://localhost:3000`, redirect `http://localhost:3000/auth/google/callback`)
4. Bấm **Create** → chép **Client ID** và **Client secret**.

### 2. Facebook (Meta for Developers)
1. Vào https://developers.facebook.com/apps → **Create app** → chọn use case **Authenticate and request data from users with Facebook Login** (Xác thực người dùng bằng Đăng nhập Facebook).
2. **App settings → Basic**:
   - **App domains**: `cotuong-online-6qpn.onrender.com`
   - **Privacy Policy URL**: `https://cotuong-online-6qpn.onrender.com/chinh-sach-bao-mat` (bắt buộc để chuyển sang Live)
   - **Terms of Service URL**: `https://cotuong-online-6qpn.onrender.com/dieu-khoan`
   - **User data deletion** → chọn *Data deletion instructions URL*: `https://cotuong-online-6qpn.onrender.com/xoa-du-lieu`
   - Chọn Category (vd Games).
   - Chép **App ID** và **App secret**.
3. **Use cases → Authentication and account creation → Customize → Settings** (hoặc **Facebook Login → Settings**):
   - **Client OAuth login**: Bật · **Web OAuth login**: Bật · **Enforce HTTPS**: Bật
   - **Valid OAuth Redirect URIs**: `https://cotuong-online-6qpn.onrender.com/auth/facebook/callback`
   - Quyền dùng: chỉ `public_profile` (không cần App Review).
4. Chuyển app từ **Development** sang **Live** (công tắc *App mode* / *Publish*). Khi còn ở Development, chỉ tài khoản có vai trò trong app (Admin/Developer/Tester) đăng nhập được.

### Trang pháp lý có sẵn
| Trang | Đường dẫn | Bí danh |
|---|---|---|
| Chính sách bảo mật | `/chinh-sach-bao-mat` | `/privacy`, `/privacy-policy` |
| Điều khoản sử dụng | `/dieu-khoan` | `/terms` |
| Hướng dẫn xoá dữ liệu | `/xoa-du-lieu` | `/data-deletion` |

Nội dung tiếng Việt kèm phần tiếng Anh, liên kết ở chân trang sảnh. Sửa nội dung: các file `public/chinh-sach-bao-mat.html`, `public/dieu-khoan.html`, `public/xoa-du-lieu.html` (email liên hệ: huydinhvn1@gmail.com). Nếu sau này đổi dữ liệu thu thập (vd thêm email) thì phải cập nhật chính sách – `test/legal.test.js` sẽ báo lỗi nếu mã nguồn bắt đầu xin/lưu email.

### 3. Cơ sở dữ liệu (Supabase – miễn phí)
Ổ đĩa của Render free bị xoá mỗi lần khởi động lại, nên tài khoản và thống kê cần lưu ở Postgres bên ngoài.
1. Vào https://supabase.com → **New project** (chọn region gần, vd Singapore), đặt **Database password** và ghi lại.
2. Bấm **Connect** (trên thanh trên cùng) → tab **Connection string** → **URI**, chọn **Session pooler** (IPv4, phù hợp Render). Chuỗi có dạng:
   `postgresql://postgres.<project-ref>:<MẬT-KHẨU>@aws-0-<region>.pooler.supabase.com:5432/postgres`
   Thay `<MẬT-KHẨU>` bằng mật khẩu ở bước 1 (ký tự đặc biệt trong mật khẩu cần mã hoá URL, vd `@` → `%40`).
3. Không cần tạo bảng: server tự tạo bảng `cotuong_users` và bảng Elo `cotuong_users_ratings` khi khởi động (`CREATE TABLE IF NOT EXISTS` – bảng cũ giữ nguyên dữ liệu, người dùng cũ có Elo mặc định 1200).

Không đặt `DATABASE_URL` thì server lưu vào file `data/users.json` (chỉ hợp cho chạy trên máy; trên Render sẽ mất khi server khởi động lại).

### 4. Biến môi trường trên Render
Render → service **cotuong-online** → **Environment** → **Add Environment Variable**:

| Biến | Giá trị |
|---|---|
| `PUBLIC_URL` | `https://cotuong-online-6qpn.onrender.com` (không có `/` ở cuối) |
| `SESSION_SECRET` | chuỗi ngẫu nhiên dài, vd tạo bằng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GOOGLE_CLIENT_ID` | Client ID ở bước 1 |
| `GOOGLE_CLIENT_SECRET` | Client secret ở bước 1 |
| `FACEBOOK_APP_ID` | App ID ở bước 2 |
| `FACEBOOK_APP_SECRET` | App secret ở bước 2 |
| `DATABASE_URL` | chuỗi kết nối Supabase ở bước 3 |

Lưu → Render tự deploy lại. Kiểm tra: mở `https://cotuong-online-6qpn.onrender.com/api/me` phải thấy `"providers":{"google":true,"facebook":true}`.

Biến tuỳ chọn: `ABANDON_MS` (ván xếp hạng: thời gian mất kết nối trước khi bị xử thua, mặc định 60000), `USERS_FILE` (đường dẫn file JSON khi không có DATABASE_URL, mặc định `data/users.json`), `USERS_TABLE` (tên bảng Postgres, mặc định `cotuong_users`), `FACEBOOK_GRAPH_VERSION` (mặc định `v26.0`).

> Không đặt `SESSION_SECRET` thì server tự sinh khoá ngẫu nhiên mỗi lần khởi động → mọi người bị đăng xuất sau mỗi lần Render khởi động lại.

### Cách hoạt động
- Đăng nhập theo luồng OAuth "authorization code" phía server (Google có PKCE). Server chỉ lấy **tên** và **ảnh đại diện** (không lấy email).
- Phiên đăng nhập là cookie `ct_session` có ký HMAC (httpOnly, SameSite=Lax, Secure khi chạy https), hạn 30 ngày. Đăng xuất: nút "Đăng xuất" ở sảnh.
- Người đã đăng nhập: tên tài khoản tự dùng làm tên trong phòng. Khách: nhập tên như cũ.
- Thống kê Thắng/Thua/Hoà chỉ được ghi khi ván online kết thúc, cả hai ghế đều có người, ván có ít nhất 2 nước, và hai ghế không cùng một tài khoản. Khách đấu với người có tài khoản thì chỉ người có tài khoản được ghi.
- Lưu trong cơ sở dữ liệu: id, nhà cung cấp (google/facebook), id bên nhà cung cấp, tên hiển thị, ảnh đại diện, ngày tạo, số ván thắng/thua/hoà; Elo + số ván xếp hạng theo kiểu cờ (bảng `<USERS_TABLE>_ratings`, xoá người dùng thì Elo bị xoá theo). Cập nhật Elo của hai người trong một giao dịch (khoá dòng) nên không mất điểm khi nhiều ván kết thúc cùng lúc.
- Kiểm thử Postgres thật (tuỳ chọn): `TEST_DATABASE_URL=postgres://... npm test`.

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
