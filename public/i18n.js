/* Cờ Tướng Online – song ngữ Tiếng Việt / English.
   Dùng chung cho trình duyệt (window.I18N) và kiểm thử Node (module.exports).
   t(key, params): chuỗi thuần (đặt vào textContent); th(key, params): chuỗi HTML, tham số được thoát ký tự.
   Mặc định: localStorage 'ct_lang' -> navigator.language (vi* -> vi, còn lại -> en). */
(function (root) {
  'use strict';
  var D = { vi: {}, en: {} };
  function def(k, vi, en) { D.vi[k] = vi; D.en[k] = en; }

  // ---------- Chung ----------
  def('title', 'Cờ Tướng Online', 'Xiangqi Online');
  def('title.home', 'Cờ Tướng Online – Chơi cờ tướng với máy, Cờ Úp miễn phí', 'Xiangqi Online – Play Chinese Chess & Jieqi Free');
  def('title.myTurn', '● Đến lượt bạn – ', '● Your move – ');
  def('title.unread', '({n}) Tin nhắn mới – Cờ Tướng', '({n}) New messages – Xiangqi');
  def('meta.desc', 'Chơi cờ tướng online miễn phí với bạn bè hoặc chơi cờ tướng với máy 5 cấp độ, cờ úp online, tìm đối thủ có Elo. Không cần cài đặt – chơi ngay trên điện thoại và máy tính.', 'Play Xiangqi (Chinese chess) online for free – with friends, against the computer at 5 levels, or Jieqi (hidden pieces) with rated matchmaking. Nothing to install – play on phone or desktop.');
  def('brand', 'Cờ Tướng<small>online</small>', 'Xiangqi<small>online</small>');
  def('lang.btn', 'VI', 'EN');
  def('lang.aria', 'Ngôn ngữ: Tiếng Việt – chuyển sang English', 'Language: English – switch to Vietnamese');
  def('conn.connecting', 'Đang kết nối…', 'Connecting…');
  def('donate.btn', 'Ủng hộ', 'Donate');
  def('donate.aria', 'Ủng hộ tác giả', 'Support the author');
  def('inbox', 'Tin nhắn', 'Messages');
  def('inbox.unreadAria', 'Tin nhắn – {n} chưa đọc', 'Messages – {n} unread');
  def('sound.title', 'Âm thanh', 'Sound');
  def('sound.aria', 'Bật/tắt âm thanh', 'Sound on/off');
  def('close', 'Đóng', 'Close');
  def('cancel', 'Huỷ', 'Cancel');
  def('accept', 'Đồng ý', 'Accept');
  def('decline', 'Từ chối', 'Decline');
  def('send', 'Gửi', 'Send');
  def('loading', 'Đang tải…', 'Loading…');
  def('you', 'Bạn', 'You');
  def('youTag', '(bạn)', '(you)');
  def('opponent', 'Đối thủ', 'Opponent');
  def('guest', 'Khách', 'Guest');
  def('guestName', 'Kỳ thủ {id}', 'Player {id}');
  def('spectator', 'khán giả', 'spectator');
  def('rated', 'Xếp hạng', 'Rated');
  def('failRetry', 'Không thực hiện được – thử lại sau', "Couldn't do that – please try again later");
  def('session.expired', 'Phiên đăng nhập đã hết – hãy đăng nhập lại', 'Your session has expired – please sign in again');

  // ---------- Kiểu cờ, quân, cấp độ ----------
  def('v.standard', 'Cờ tướng', 'Xiangqi');
  def('v.jieqi', 'Cờ úp', 'Jieqi');
  def('v.jieqiLong', 'Cờ úp', 'Jieqi (hidden pieces)');
  def('v.lower.standard', 'cờ tướng', 'Xiangqi');
  def('v.lower.jieqi', 'cờ úp', 'Jieqi');
  def('side.r', 'Đỏ', 'Red');
  def('side.b', 'Đen', 'Black');
  def('side.random', 'Ngẫu nhiên', 'Random');
  def('side.rFirst', 'Đỏ (đi trước)', 'Red (moves first)');
  def('lv.1', 'Tập chơi', 'Beginner');
  def('lv.2', 'Dễ', 'Easy');
  def('lv.3', 'Vừa', 'Medium');
  def('lv.4', 'Khó', 'Hard');
  def('lv.5', 'Đại sư', 'Master');

  // ---------- Sảnh ----------
  def('hero.h1', 'Cờ Tướng <span>Online</span>', 'Xiangqi <span>Online</span>');
  def('hero.lead', 'Thách đấu bạn bè chỉ với một đường link, hoặc rèn luyện cùng máy với 5 cấp độ. Không cần đăng ký.', 'Challenge a friend with just a link, or practise against the computer at 5 levels. No sign-up needed.');
  def('name.label', 'Tên của bạn', 'Your name');
  def('name.ph', 'Nhập tên…', 'Enter your name…');
  def('live.title', 'Đang trực tuyến', 'Online now');
  def('live.members', 'thành viên', 'members');
  def('live.guests', 'khách', 'guests');
  def('live.playing', 'ván đang chơi', 'playing');
  def('live.searching', 'đang tìm trận', 'searching');
  def('quick.title', 'Tìm đối thủ tự động', 'Quick match');
  def('quick.desc', 'Ghép với người chơi cùng trình độ · ván xếp hạng Elo · 10 phút + 5 giây mỗi nước', 'Get paired with a player of similar strength · Elo-rated · 10 min + 5 s per move');
  def('mm.find', 'Tìm đối thủ', 'Find opponent');
  def('mm.searching', 'Đang tìm đối thủ…', 'Looking for an opponent…');
  def('mm.cancel', 'Huỷ tìm', 'Stop');
  def('mm.loginBtn', 'Đăng nhập để tìm đối thủ tự động', 'Sign in to use quick match');
  def('mm.myElo', 'Elo {v} của bạn: <b>{r}</b> · ', 'Your {v} Elo: <b>{r}</b> · ');
  def('mm.games', '{n} ván xếp hạng', '{n} rated games');
  def('mm.games.one', '{n} ván xếp hạng', '{n} rated game');
  def('mm.noGames', 'chưa có ván xếp hạng', 'no rated games yet');
  def('mm.info', '{v} · Elo {r} · {range}', '{v} · Elo {r} · {range}');
  def('mm.anyLevel', 'mọi trình độ', 'any level');
  def('mm.gap', 'chênh tối đa ±{g}', 'within ±{g}');
  def('mm.otherTab', 'Bạn đang tìm đối thủ ở thẻ hoặc thiết bị khác', 'You are looking for a match in another tab or on another device');
  def('mm.found', 'Đã tìm thấy đối thủ: {name} (Elo {r}) – ván {v}, bạn cầm quân {side}', 'Opponent found: {name} (Elo {r}) – {v}, you play {side}');
  def('card.friend.h', 'Chơi với bạn', 'Play a friend');
  def('card.friend.p', 'Tạo phòng, gửi link cho bạn bè. Người khác vào sau sẽ được xem trực tiếp.', 'Create a room and send the link to a friend. Anyone who joins later can watch live.');
  def('f.variant', 'Kiểu cờ', 'Game type');
  def('f.jqhelp', 'Luật cờ úp?', 'Jieqi rules?');
  def('f.time', 'Thời gian mỗi bên', 'Time per side');
  def('f.inc', 'Cộng giờ mỗi nước', 'Increment per move');
  def('f.color', 'Bạn cầm quân', 'You play');
  def('f.level', 'Cấp độ', 'Level');
  def('btn.create', 'Tạo phòng', 'Create room');
  def('card.join.h', 'Vào phòng', 'Join a room');
  def('card.join.p', 'Nhập mã phòng 6 ký tự mà bạn bè gửi cho bạn.', 'Enter the 6-character room code your friend sent you.');
  def('btn.join', 'Vào', 'Join');
  def('howto.1', 'Tạo phòng', 'Create a room');
  def('howto.2', 'Gửi link / mã', 'Share link / code');
  def('howto.3', 'Bắt đầu chơi', 'Start playing');
  def('card.ai.h', 'Chơi với máy', 'Play the computer');
  def('card.ai.p', 'AI tìm kiếm alpha-beta chạy ngay trên trình duyệt của bạn.', 'An alpha-beta search AI that runs right in your browser.');
  def('btn.start', 'Bắt đầu', 'Start');
  def('foot.rules', 'Luật: chiếu bí hoặc vây hết nước đều thắng · Lặp lại thế cờ 3 lần = hoà · Lộ mặt tướng không hợp lệ', 'Rules: checkmate or stalemate wins · Threefold repetition = draw · The two Generals may not face each other');
  def('foot.legal', 'Thông tin pháp lý', 'Legal information');
  def('foot.privacy', 'Chính sách bảo mật', 'Privacy Policy');
  def('foot.terms', 'Điều khoản sử dụng', 'Terms of Use');
  def('foot.deletion', 'Xoá dữ liệu', 'Data Deletion');
  def('foot.donate', 'Ủng hộ tác giả', 'Support the author');
  def('resume.ai', 'Bạn có một ván <b>{v}</b> với máy đang dở · <b>cấp {lv}</b> · {moves}', 'Unfinished <b>{v}</b> game vs the computer · <b>{lv}</b> · {moves}');
  def('resume.continue', 'Chơi tiếp', 'Continue');
  def('resume.room', 'Phòng gần nhất: <b>{code}</b>', 'Last room: <b>{code}</b>');
  def('resume.back', 'Quay lại phòng', 'Back to room');
  def('ask.h', 'Bạn tên gì?', "What's your name?");
  def('ask.p', 'Tên sẽ hiển thị với đối thủ trong phòng.', 'Your name will be shown to your opponent in the room.');
  def('ask.ok', 'Vào phòng', 'Enter room');
  def('room.invalid', 'Mã phòng không hợp lệ', 'Invalid room code');
  def('login.failed', 'Đăng nhập {p} không thành công. Bạn vẫn có thể chơi với tư cách khách.', '{p} sign-in failed. You can still play as a guest.');

  // ---------- Tài khoản ----------
  def('acc.cardAria', 'Xem thông tin người chơi của bạn', 'View your player info');
  def('acc.stats', 'Thắng <em>{w}</em> · Thua <em>{l}</em> · Hoà <em>{d}</em>', 'Wins <em>{w}</em> · Losses <em>{l}</em> · Draws <em>{d}</em>');
  def('acc.logout', 'Đăng xuất', 'Sign out');
  def('acc.google', 'Đăng nhập Google', 'Sign in with Google');
  def('acc.facebook', 'Đăng nhập Facebook', 'Sign in with Facebook');
  def('acc.guest', 'Chơi với tư cách khách', 'Playing as a guest');

  // ---------- Ván cờ ----------
  def('tab.moves', 'Nước đi', 'Moves');
  def('tab.chat', 'Trò chuyện', 'Chat');
  def('chat.ph', 'Nhắn gì đó…', 'Say something…');
  def('chat.unreadAria', 'Trò chuyện – {n} tin nhắn chưa đọc', 'Chat – {n} unread messages');
  def('chat.onlineOnly', 'Trò chuyện chỉ dùng khi chơi online', 'Chat is only available in online games');
  def('ct.open', 'Mở trò chuyện', 'Open chat');
  def('ct.close', 'Đóng thông báo', 'Dismiss');
  def('river.l', 'Sở Hà', 'Chu River');
  def('river.r', 'Hán Giới', 'Han Border');
  def('check', 'Chiếu tướng!', 'Check!');
  def('ai.name', 'Máy · {lv}', 'Computer · {lv}');
  def('seat.empty', 'Ghế trống', 'Empty seat');
  def('bar.side', 'Quân {side}', '{side}');
  def('bar.youSide', 'Bạn · Quân {side}', 'You · {side}');
  def('pinfo', 'Thông tin người chơi', 'Player info');
  def('pinfo.aria', 'Thông tin người chơi: {name}', 'Player info: {name}');
  def('pinfo.view', 'Xem thông tin người chơi', 'View player info');
  def('online', 'Đang online', 'Online');
  def('offline', 'Mất kết nối', 'Disconnected');
  def('sit', 'Ngồi vào', 'Take seat');
  def('st.aborted', 'Ván bị huỷ', 'Game aborted');
  def('st.draw', 'Hoà cờ · {why}', 'Draw · {why}');
  def('st.youWin', 'Bạn thắng', 'You won');
  def('st.youLose', 'Bạn thua', 'You lost');
  def('st.sideWins', '{side} thắng', '{side} wins');
  def('st.waiting', 'Đang chờ đối thủ vào phòng…', 'Waiting for an opponent to join…');
  def('st.aiThinking', 'Máy đang suy nghĩ', 'The computer is thinking');
  def('st.yourTurn', 'Đến lượt bạn', 'Your move');
  def('st.oppThinking', 'Đối thủ đang suy nghĩ…', 'Opponent is thinking…');
  def('st.turnOf', 'Lượt quân {side}', '{side} to move');
  def('st.check', ' — Chiếu tướng!', ' — Check!');
  def('r.checkmate', 'Chiếu bí', 'Checkmate');
  def('r.stalemate', 'Hết nước đi (bị vây)', 'No legal moves (stalemate)');
  def('r.timeout', 'Hết giờ', 'Time out');
  def('r.resign', 'Xin thua', 'Resignation');
  def('r.agreement', 'Hai bên đồng ý hoà', 'Draw by agreement');
  def('r.repetition', 'Lặp lại thế cờ 3 lần', 'Threefold repetition');
  def('r.nocapture', '120 nước liên tiếp không ăn quân', '120 moves in a row without a capture');
  def('r.insufficient', 'Không còn quân tấn công', 'No attacking pieces left');
  def('r.perpetual', 'Chiếu dai (chiếu lặp lại) bị cấm – bên chiếu không còn nước khác', 'Perpetual check is forbidden – the checking side has no other move');
  def('r.abandon', 'Rời ván quá lâu (mất kết nối)', 'Left the game for too long (disconnected)');
  def('r.aborted', 'Một bên rời đi trước khi đủ 2 nước – không tính điểm', 'A player left before 2 moves were played – not counted');
  def('of.undo', 'xin đi lại', 'asks to take back a move');
  def('of.draw', 'cầu hoà', 'offers a draw');
  def('of.rematch', 'muốn chơi ván mới (đổi màu quân)', 'wants a rematch (colours swap)');
  def('of.wait.undo', 'Đang chờ đối thủ trả lời lời xin đi lại…', 'Waiting for your opponent to answer your takeback request…');
  def('of.wait.draw', 'Đang chờ đối thủ trả lời lời cầu hoà…', 'Waiting for your opponent to answer your draw offer…');
  def('of.wait.rematch', 'Đang chờ đối thủ trả lời lời muốn chơi ván mới…', 'Waiting for your opponent to answer your rematch request…');
  def('om.undo', 'xin đi lại nước vừa rồi', 'Asks to take back the last move');
  def('om.draw', 'đề nghị hoà cờ', 'Offers a draw');
  def('om.rematch', 'muốn chơi ván mới (hai bên đổi màu quân)', 'Wants a rematch (both sides swap colours)');
  def('c.undo', 'Đi lại', 'Undo');
  def('c.hint', 'Gợi ý', 'Hint');
  def('c.resign', 'Xin thua', 'Resign');
  def('c.new', 'Ván mới', 'New game');
  def('c.flip', 'Xoay bàn', 'Flip board');
  def('c.lobby', 'Về sảnh', 'Lobby');
  def('c.undoReq', 'Xin đi lại', 'Takeback');
  def('c.draw', 'Cầu hoà', 'Offer draw');
  def('c.rematch', 'Chơi lại', 'Rematch');
  def('c.leave', 'Rời phòng', 'Leave room');
  def('moves.empty', 'Chưa có nước đi nào', 'No moves yet');
  def('moves.legend', 'Tg Tướng · S Sĩ · T Tượng · M Mã · X Xe · P Pháo · B Tốt · “.” tiến · “/” lui · “-” bình · t/g/s quân trước/giữa/sau', 'K General · A Advisor · E Elephant · H Horse · R Chariot · C Cannon · P Soldier · “+” advance · “−” retreat · “=” sideways · f/m/r front/middle/rear piece');
  def('moves.n', '{n} nước', '{n} moves');
  def('moves.n.one', '{n} nước', '{n} move');
  def('rp.min', '{n} phút', '{n} min');
  def('rp.unlimited', 'Không giới hạn', 'No time limit');
  def('rp.code', 'Mã phòng', 'Room code');
  def('rp.copyCode', 'Sao chép mã', 'Copy code');
  def('rp.ratedTitle', 'Ván ghép trận tự động – tính Elo', 'Quick-match game – Elo rated');
  def('rp.spect', '{n} người xem', '{n} watching');
  def('rp.game', 'Ván #{n}', 'Game #{n}');
  def('rp.invite', 'Mời bạn', 'Invite');
  def('rp.ai', 'Chơi với máy', 'Vs computer');
  def('rp.level', 'Cấp {lv}', '{lv}');
  def('rp.yourSide', 'Bạn cầm quân {side}', 'You play {side}');
  def('rp.saved', 'Ván được tự lưu', 'Game is saved automatically');
  def('rp.rules', 'Xem luật', 'Rules');
  def('badge.ai', 'với máy', 'vs AI');
  def('badge.room', 'Phòng', 'Room');
  def('badge.title', 'Đang chơi {v}', 'Playing {v}');
  def('badge.title.ai', 'Đang chơi {v} với máy', 'Playing {v} against the computer');
  def('badge.title.rated', 'Đang chơi {v} – ván xếp hạng', 'Playing {v} – rated game');
  def('copied', 'Đã sao chép', 'Copied');
  def('copy.done', 'Đã chép', 'Copied');
  def('sh.title', 'Chia sẻ', 'Share');
  def('sh.zalo', 'Zalo', 'Zalo');
  def('sh.messenger', 'Messenger', 'Messenger');
  def('sh.facebook', 'Facebook', 'Facebook');
  def('sh.more', 'Khác…', 'More…');
  def('sh.copy', 'Sao chép', 'Copy link');
  def('sh.via', 'Chia sẻ qua {app}', 'Share via {app}');
  def('sh.pasteZalo', 'Đã sao chép link – mở Zalo và dán vào cuộc trò chuyện nhé!', 'Link copied – open Zalo and paste it into a chat!');
  def('sh.pasteMessenger', 'Đã sao chép link – dán vào Messenger để gửi cho bạn bè nhé!', 'Link copied – paste it into Messenger to send to a friend!');
  def('sh.copied', 'Đã sao chép link!', 'Link copied!');
  def('sh.room.h', 'Mời bạn vào phòng', 'Invite a friend');
  def('sh.web.btn', 'Chia sẻ web', 'Share this site');
  def('sh.web.h', 'Chia sẻ Cờ Tướng Online', 'Share Xiangqi Online');
  def('sh.web.lead', 'Rủ bạn bè cùng chơi cờ tướng, cờ úp online miễn phí – gửi link qua Zalo, Messenger hoặc Facebook.', 'Invite friends to play Xiangqi and Jieqi online for free – send the link via Zalo, Messenger or Facebook.');
  def('sh.web.text', 'Chơi cờ tướng & cờ úp online miễn phí, không cần cài đặt: chơi với máy hoặc mời bạn bè qua link.', 'Play Xiangqi & Jieqi online for free, nothing to install: play the computer or invite friends with a link.');
  def('sh.web.strip', 'Thấy hay? Rủ bạn bè cùng chơi!', 'Enjoying it? Invite your friends!');
  def('copy.btn', 'Sao chép', 'Copy');
  def('copy.fail', 'Không sao chép được – hãy chép tay: {text}', "Couldn't copy – please copy it manually: {text}");
  def('copied.code', 'Đã sao chép mã phòng', 'Room code copied');
  def('copied.link', 'Đã sao chép link mời – gửi cho bạn bè nhé!', 'Invite link copied – send it to a friend!');
  def('share.text', 'Vào chơi {v} với mình nhé! Mã phòng {code}', 'Come play {v} with me! Room code {code}');
  def('resign.q', 'Xin thua ván này?', 'Resign this game?');
  def('resign.p', 'Đối thủ sẽ được tính thắng.', 'Your opponent will be awarded the win.');
  def('end.draw', 'Hoà cờ', 'Draw');
  def('end.win', 'Bạn thắng! 🎉', 'You won! 🎉');
  def('end.lose', 'Bạn thua rồi', 'You lost');
  def('end.sideWins', 'Quân {side} thắng', '{side} wins');
  def('end.resigned', 'Quân {side} xin thua', '{side} resigned');
  def('end.reasonWins', '{why} – quân {side} thắng', '{why} – {side} wins');
  def('end.review', 'Xem lại bàn cờ', 'Review board');
  def('hint.searching', 'Đang tìm nước gợi ý…', 'Looking for a hint…');
  def('jq.roomToast', 'Phòng này chơi Cờ úp – bấm “Xem luật” nếu chưa quen', 'This room plays Jieqi (hidden pieces) – tap “Rules” if you are new to it');
  def('elo.notCounted', 'Ván chưa đủ 2 nước – không tính Elo', 'Fewer than 2 moves – Elo unchanged');
  def('elo.updating', 'Đang cập nhật Elo…', 'Updating Elo…');
  def('elo.line', 'Elo {v}: {b} → <b>{a}</b> ({d})', '{v} Elo: {b} → <b>{a}</b> ({d})');
  def('elo.toast', 'Elo {v}: {a} ({d})', '{v} Elo: {a} ({d})');

  // ---------- Luật cờ úp ----------
  def('jq.title', 'Luật cờ úp', 'Jieqi (hidden pieces) rules');
  def('jq.r1', '<b>Tướng</b> đặt ngửa ở chỗ cũ. 15 quân còn lại của mỗi bên được xáo ngẫu nhiên và <b>úp mặt</b> vào 15 vị trí xuất phát.', 'The <b>General</b> starts face-up on its usual point. Each side’s other 15 pieces are shuffled and placed <b>face-down</b> on the 15 starting points.');
  def('jq.r2', 'Quân úp đi theo <b>quân vốn đứng ở ô đó</b>: úp ở ô Pháo thì đi như Pháo, ô Mã đi như Mã, ô Sĩ đi như Sĩ (trong cung)…', 'A face-down piece moves like <b>the piece that normally starts on that point</b>: on a Cannon point it moves like a Cannon, on a Horse point like a Horse, on an Advisor point like an Advisor (inside the palace)…');
  def('jq.r3', 'Đi xong nước đầu tiên, quân được <b>lật ngửa</b> và từ đó đi theo mặt thật.', 'After its first move the piece is <b>turned face-up</b> and from then on moves as what it really is.');
  def('jq.r4', '<b>Sĩ, Tượng</b> đã lật được đi khắp bàn – qua sông, ra khỏi cung (Sĩ vẫn chéo 1 ô; Tượng vẫn chéo 2 ô và bị cản mắt).', 'Revealed <b>Advisors and Elephants</b> may go anywhere – across the river and out of the palace (an Advisor still moves 1 point diagonally; an Elephant still moves 2 points diagonally and can be blocked).');
  def('jq.r5', 'Được ăn quân đang úp – quân bị ăn sẽ lộ mặt.', 'Face-down pieces can be captured – a captured piece is revealed.');
  def('jq.r6', 'Không ai biết quân úp là gì, kể cả người cầm quân. Chiếu, chiếu bí, lộ mặt tướng, cấm chiếu dai… như cờ tướng.', 'Nobody knows what a face-down piece is, not even its owner. Check, checkmate, facing Generals, the ban on perpetual check… all work as in standard Xiangqi.');
  def('jq.ok', 'Đã hiểu', 'Got it');

  // ---------- Ủng hộ (Zelle) ----------
  def('dn.title', 'Ủng hộ tác giả qua Zelle', 'Support the author via Zelle');
  def('dn.lead', 'Cảm ơn bạn rất nhiều!<span lang="en">Support the author via Zelle – thank you!</span>', 'Thank you so much for your support!');
  def('dn.alt', 'Mã QR Zelle – người nhận {name} (Zelle QR code, recipient {name})', 'Zelle QR code – recipient {name}');
  def('dn.to', 'Người nhận · Recipient', 'Recipient');
  def('dn.how', 'Mở app ngân hàng → Zelle → quét mã QR<span lang="en">Open your bank app → Zelle → scan the QR code.</span>', 'Open your bank app → Zelle → scan the QR code.');
  def('dn.save', 'Trên điện thoại: nhấn giữ ảnh để lưu, rồi chọn ảnh trong Zelle.', 'On a phone: press and hold the image to save it, then pick it in Zelle.');
  def('dn.download', 'Tải ảnh QR', 'Download QR image');
  def('dn.note', 'Zelle chỉ dùng được với tài khoản ngân hàng tại Mỹ. Trang này không xử lý thanh toán. <span lang="en">Zelle works only with US bank accounts; this site does not process payments.</span>', 'Zelle works only with US bank accounts. This site does not process any payments.');

  // ---------- Thẻ người chơi ----------
  def('pc.ai', 'Máy', 'Computer');
  def('pc.aiKind', 'Cấp {lv} · chơi trên máy của bạn', '{lv} · runs on your device');
  def('pc.aiNote', 'Máy không có Elo hay thống kê.', 'The computer has no Elo or statistics.');
  def('pc.selfGuest', 'Bạn đang chơi với tư cách khách – đăng nhập để có Elo, thống kê và nhắn tin.', 'You are playing as a guest – sign in to get Elo, statistics and messaging.');
  def('pc.guestNote', 'Người chơi khách không có Elo, thống kê và không nhận tin nhắn.', 'Guest players have no Elo or statistics and cannot receive messages.');
  def('pc.loading', 'Đang tải thông tin…', 'Loading player info…');
  def('pc.signedIn', 'Đã đăng nhập', 'Signed in');
  def('pc.signedInWith', 'Đã đăng nhập bằng {p}', 'Signed in with {p}');
  def('pc.eloGames', 'Elo · {n} ván xếp hạng', 'Elo · {n} rated games');
  def('pc.eloGames.one', 'Elo · {n} ván xếp hạng', 'Elo · {n} rated game');
  def('pc.wins', 'Thắng', 'Wins');
  def('pc.losses', 'Thua', 'Losses');
  def('pc.draws', 'Hoà', 'Draws');
  def('pc.rated', 'Ván xếp hạng: <b>{n}</b>', 'Rated games: <b>{n}</b>');
  def('pc.joined', 'Tham gia: <b>{d}</b>', 'Joined: <b>{d}</b>');
  def('pc.myMsgs', 'Tin nhắn của bạn', 'Your messages');
  def('pc.loginToMsg', 'Đăng nhập để nhắn tin với người chơi này.', 'Sign in to message this player.');
  def('pc.msg', 'Nhắn tin', 'Message');
  def('pc.blockedNote', 'Bạn đã chặn người này – họ không nhắn tin cho bạn được.', 'You have blocked this player – they cannot message you.');
  def('pc.notFound', 'Không tìm thấy người chơi này.', 'Player not found.');
  def('pc.loadFail', 'Không tải được thông tin – thử lại sau.', "Couldn't load player info – please try again later.");
  def('block', 'Chặn', 'Block');
  def('unblock', 'Bỏ chặn', 'Unblock');
  def('block.q', 'Chặn người này?', 'Block this player?');
  def('block.p', 'Người bị chặn sẽ không gửi tin nhắn cho bạn được nữa. Bạn có thể bỏ chặn bất cứ lúc nào.', 'A blocked player can no longer send you messages. You can unblock them at any time.');

  // ---------- Tin nhắn riêng ----------
  def('dm.guest', 'Đăng nhập bằng Google để nhắn tin riêng với người chơi khác. Khách không gửi / nhận tin nhắn được.', 'Sign in with Google to send private messages to other players. Guests cannot send or receive messages.');
  def('dm.blockedTag', 'Đã chặn', 'Blocked');
  def('dm.you', 'Bạn: ', 'You: ');
  def('dm.none', 'Chưa có tin nhắn nào.<br>Chạm vào ảnh đại diện của người chơi (trong ván hoặc sau khi ghép trận) rồi chọn <b>Nhắn tin</b>.', 'No messages yet.<br>Tap a player’s avatar (during a game or after a quick match) and choose <b>Message</b>.');
  def('dm.inboxFail', 'Không tải được hộp thư – thử lại sau.', "Couldn't load your inbox – please try again later.");
  def('dm.back', 'Quay lại hộp thư', 'Back to inbox');
  def('dm.ph', 'Nhắn tin…', 'Write a message…');
  def('dm.aria', 'Nội dung tin nhắn', 'Message text');
  def('dm.empty', 'Chưa có tin nhắn. Gửi lời chào tới {name} nhé!', 'No messages yet. Say hi to {name}!');
  def('dm.loadFail', 'Không tải được tin nhắn – thử lại sau.', "Couldn't load messages – please try again later.");
  def('dm.blockedInfo', 'Bạn đã chặn người này. Bỏ chặn để nhắn tin.', 'You have blocked this player. Unblock them to send messages.');
  def('dm.offline', 'Đang mất kết nối – thử lại sau giây lát.', 'Connection lost – try again in a moment.');
  def('dm.sendFail', 'Gửi chưa được – thử lại.', 'Not sent – please try again.');
  def('dm.blockedToast', 'Đã chặn – người này không nhắn tin cho bạn được nữa', 'Blocked – this player can no longer message you');
  def('dm.unblockedToast', 'Đã bỏ chặn', 'Unblocked');
  def('dm.deleted', 'Người chơi đã xoá', 'Deleted player');
  // lỗi tin nhắn từ server (theo mã)
  def('dme.login', 'Đăng nhập để nhắn tin.', 'Sign in to send messages.');
  def('dme.origin', 'Không gửi được tin nhắn.', "The message couldn't be sent.");
  def('dme.too_long', 'Tin nhắn tối đa {max} ký tự.', 'Messages can be at most {max} characters.');
  def('dme.empty', 'Tin nhắn trống.', 'The message is empty.');
  def('dme.no_user', 'Không tìm thấy người nhận.', 'Recipient not found.');
  def('dme.rate', 'Bạn gửi nhanh quá – đợi một chút rồi gửi tiếp nhé.', "You're sending messages too fast – wait a moment and try again.");
  def('dme.blocked', 'Bạn không thể nhắn tin cho người này.', "You can't message this player.");
  def('dme.you_blocked', 'Bạn đã chặn người này – bỏ chặn để nhắn tin.', 'You have blocked this player – unblock them to send messages.');

  // ---------- Thông báo / lỗi từ server (key + params) ----------
  def('err.no_room', 'Không tìm thấy phòng. Có thể phòng đã hết hạn.', 'Room not found. It may have expired.');
  def('err.mm_login', 'Đăng nhập để tìm đối thủ tự động.', 'Sign in to use quick match.');
  def('err.not_playing', 'Ván cờ chưa bắt đầu hoặc đã kết thúc.', 'The game has not started yet or is already over.');
  def('err.not_your_turn', 'Chưa đến lượt bạn.', "It's not your turn.");
  def('err.perpetual', 'Không được chiếu lặp lại – hãy đổi nước', 'Perpetual check is not allowed – play a different move');
  def('err.invalid_move', 'Nước đi không hợp lệ.', 'Illegal move.');
  def('err.no_undo', 'Bạn chưa đi nước nào để xin đi lại.', "You haven't made a move to take back yet.");
  def('err.unauth', 'Chưa xác thực.', 'Not authenticated.');
  def('ts.joined', '{name} đã vào phòng (quân {side})', '{name} joined the room ({side})');
  def('ts.watch', '{name} vào xem', '{name} is watching');
  def('ts.sat', '{name} ngồi vào quân {side}', '{name} took the {side} seat');
  def('ts.declined', '{name} từ chối {what}.', '{name} declined the {what}.');
  def('dw.undo', 'xin đi lại', 'takeback');
  def('dw.draw', 'cầu hoà', 'draw offer');
  def('dw.rematch', 'chơi ván mới', 'rematch');
  def('ts.undone', 'Đã đồng ý cho đi lại.', 'Takeback accepted.');
  def('ts.rematch', 'Ván mới bắt đầu – hai bên đã đổi màu quân.', 'New game started – the sides have swapped colours.');
  def('ts.away', '{name} mất kết nối – nếu không quay lại trong {sec} giây sẽ bị xử thua.', "{name} disconnected – they lose if they don't return within {sec} seconds.");

  // ================= Bộ máy =================
  var LANGS = ['vi', 'en'], KEY = 'ct_lang';
  function norm(l) { return /^vi/i.test(String(l || '').trim()) ? 'vi' : 'en'; }
  function detect() {
    // ?lang=vi|en trong đường dẫn (link hreflang / chia sẻ) được ưu tiên và ghi nhớ
    try {
      var q = root.location && /[?&]lang=(vi|en)\b/i.exec(root.location.search || '');
      if (q) { var ql = q[1].toLowerCase(); try { root.localStorage && root.localStorage.setItem(KEY, ql); } catch (e) { } return ql; }
    } catch (e) { }
    try { var s = root.localStorage && root.localStorage.getItem(KEY); if (s === 'vi' || s === 'en') return s; } catch (e) { }
    var nav = root.navigator || {};
    // máy tìm kiếm / bot xem trước link (Googlebot, Facebook, Zalo…) thường báo en-US: giữ trang gốc tiếng Việt
    if (/bot\b|crawler|spider|googlebot|bingbot|facebookexternalhit|facebot|zalo|slurp|duckduck|yandex|baidu|coccoc/i.test(nav.userAgent || '')) return 'vi';
    var list = (nav.languages && nav.languages.length ? [nav.languages[0]] : []).concat(nav.language ? [nav.language] : []);
    return norm(list[0] || 'vi');
  }
  var lang = detect(), listeners = [];
  function lookup(k, p) {
    var d = D[lang] || D.vi;
    if (p && p.n === 1 && d[k + '.one'] != null) return d[k + '.one'];
    return d[k] != null ? d[k] : (D.vi[k] != null ? D.vi[k] : k);
  }
  function fill(s, p, escf) {
    if (!p) return s;
    return s.replace(/\{(\w+)\}/g, function (m, n) { return p[n] == null ? m : (escf ? escf(String(p[n])) : String(p[n])); });
  }
  function escHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function t(k, p) { return fill(lookup(k, p), p); }
  function th(k, p) { return fill(lookup(k, p), p, escHtml); }
  /** Dịch các phần tử tĩnh: data-i18n (text), data-i18n-html, data-i18n-attr="title:key;aria-label:key", data-href-en */
  function apply(scope) {
    var doc = root.document; if (!doc) return;
    scope = scope || doc;
    doc.documentElement.lang = lang;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    scope.querySelectorAll('[data-i18n-html]').forEach(function (el) { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    scope.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var i = pair.indexOf(':'); if (i > 0) el.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim()));
      });
    });
    scope.querySelectorAll('[data-href-en]').forEach(function (el) {
      if (!el.hasAttribute('data-href-vi')) el.setAttribute('data-href-vi', el.getAttribute('href'));
      el.setAttribute('href', el.getAttribute(lang === 'en' ? 'data-href-en' : 'data-href-vi'));
    });
    var md = doc.querySelector('meta[name="description"]'); if (md) md.setAttribute('content', t('meta.desc'));
  }
  function setLang(l, opts) {
    l = l === 'en' ? 'en' : 'vi';
    try { root.localStorage && root.localStorage.setItem(KEY, l); } catch (e) { }
    if (l === lang && !(opts && opts.force)) return;
    lang = l; apply();
    listeners.forEach(function (f) { try { f(lang); } catch (e) { if (root.console) root.console.error(e); } });
  }
  /** Ký hiệu nước đi: tiếng Việt giữ nguyên (P2-5, M8.7, Xt.1, kèm mặt quân lật "(X)");
      tiếng Anh đổi sang kiểu WXF: K/A/E/H/R/C/P = General/Advisor/Elephant/Horse/Chariot/Cannon/Soldier,
      + tiến, - lui, = đi ngang; quân trước / giữa / sau cùng cột: f / m / r (vd. C2=5, H8+7, Rf+1, R1-2(C)) */
  var EN_LETTER = { Tg: 'K', S: 'A', T: 'E', M: 'H', X: 'R', P: 'C', B: 'P' }, EN_TAG = { t: 'f', g: 'm', s: 'r' }, EN_ACT = { '.': '+', '/': '-', '-': '=' };
  var NOTE_RE = /^(Tg|S|T|M|X|P|B)([tgs]|\d)([.\/-])(\d)(?:\((Tg|S|T|M|X|P|B)\))?$/;
  function notation(n, l) {
    if ((l || lang) !== 'en' || !n) return n;
    var m = NOTE_RE.exec(n);
    if (!m) return n;
    return EN_LETTER[m[1]] + (EN_TAG[m[2]] || m[2]) + EN_ACT[m[3]] + m[4] + (m[5] ? '(' + EN_LETTER[m[5]] + ')' : '');
  }
  var api = {
    dict: D, langs: LANGS, t: t, th: th, apply: apply, setLang: setLang, norm: norm, detect: detect, notation: notation,
    get lang() { return lang; }, onChange: function (f) { listeners.push(f); }
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.I18N = api;
  if (root.document && root.document.documentElement) root.document.documentElement.lang = lang;
})(typeof window !== 'undefined' ? window : globalThis);
