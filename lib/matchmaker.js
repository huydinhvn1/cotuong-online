/* Hàng đợi ghép trận tự động.
   - Chỉ ghép cùng kiểu cờ, không bao giờ ghép một tài khoản với chính nó.
   - Phạm vi chênh lệch Elo chấp nhận: ±100 lúc bắt đầu, +50 mỗi 5 giây chờ, không giới hạn sau 60 giây.
     Hai người được ghép khi chênh lệch nằm trong phạm vi của người chờ lâu hơn (phạm vi rộng hơn).
   - Ưu tiên: người chờ lâu nhất được xét trước và được ghép với người có Elo gần nhất (bằng nhau thì người chờ lâu hơn). */
'use strict';
const BASE_GAP = 100, STEP_GAP = 50, STEP_MS = 5000, UNLIMITED_MS = 60000;

function allowedGap(waitMs) {
  if (waitMs >= UNLIMITED_MS) return Infinity;
  return BASE_GAP + STEP_GAP * Math.floor(Math.max(0, waitMs) / STEP_MS);
}

class Matchmaker {
  constructor(opts) { this.now = (opts && opts.now) || Date.now; this.queue = new Map(); /* key -> entry */ }
  /** entry: {key, uid, name, rating, variant}; trả về bản ghi đã thêm. Cùng key thì thay thế (giữ thời điểm bắt đầu nếu cùng kiểu cờ). */
  add(e) {
    if (!e || e.key == null || !e.uid || !e.variant) throw new Error('thiếu thông tin hàng đợi');
    const old = this.queue.get(e.key);
    const entry = { key: e.key, uid: String(e.uid), name: e.name, rating: Math.round(+e.rating) || 0, variant: e.variant,
      since: e.since != null ? e.since : old && old.variant === e.variant ? old.since : this.now(), data: e.data };
    this.queue.set(e.key, entry);
    return entry;
  }
  remove(key) { return this.queue.delete(key); }
  /** Xoá mọi bản ghi của một tài khoản (trừ key giữ lại); trả về các bản ghi đã xoá */
  removeUser(uid, exceptKey) {
    const out = [];
    for (const [k, e] of this.queue) if (e.uid === String(uid) && k !== exceptKey) { this.queue.delete(k); out.push(e); }
    return out;
  }
  has(key) { return this.queue.has(key); }
  get(key) { return this.queue.get(key) || null; }
  get size() { return this.queue.size; }
  waitMs(e) { return Math.max(0, this.now() - e.since); }
  gapFor(e) { return allowedGap(this.waitMs(e)); }
  /** Ghép tất cả cặp có thể; xoá khỏi hàng đợi và trả về [[a, b], ...] (a là người chờ lâu hơn) */
  tick() {
    const pairs = [], taken = new Set();
    const list = [...this.queue.values()].sort((x, y) => x.since - y.since || (x.key < y.key ? -1 : 1));
    for (const a of list) {
      if (taken.has(a.key)) continue;
      let best = null, bestDiff = Infinity;
      for (const b of list) {
        if (b === a || taken.has(b.key) || b.variant !== a.variant || b.uid === a.uid) continue;
        const diff = Math.abs(a.rating - b.rating);
        if (diff > Math.max(this.gapFor(a), this.gapFor(b))) continue;
        if (diff < bestDiff) { best = b; bestDiff = diff; } // danh sách đã theo thứ tự chờ -> bằng nhau thì giữ người chờ lâu hơn
      }
      if (best) { taken.add(a.key); taken.add(best.key); pairs.push([a, best]); }
    }
    for (const [a, b] of pairs) { this.queue.delete(a.key); this.queue.delete(b.key); }
    return pairs;
  }
}

module.exports = { Matchmaker, allowedGap, BASE_GAP, STEP_GAP, STEP_MS, UNLIMITED_MS };
