/* Elo cho ván xếp hạng (ghép trận tự động). Mỗi người có điểm riêng cho từng kiểu cờ.
   Mặc định 1200; K = 40 trong 20 ván đầu, sau đó K = 32. */
'use strict';
const DEFAULT_RATING = 1200;
const VARIANTS = ['standard', 'jieqi'];
const PROVISIONAL_GAMES = 20;

const kFactor = games => (games | 0) < PROVISIONAL_GAMES ? 40 : 32;
/** Xác suất thắng kỳ vọng của A trước B */
const expected = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

/** a, b = {rating, games}; scoreA = 1 (A thắng) | 0.5 (hoà) | 0 (A thua). Mỗi bên dùng hệ số K của mình. */
function update(a, b, scoreA) {
  if (![0, 0.5, 1].includes(scoreA)) throw new Error('điểm không hợp lệ: ' + scoreA);
  const ra = num(a.rating), rb = num(b.rating), ea = expected(ra, rb);
  const da = Math.round(kFactor(a.games) * (scoreA - ea));
  const db = Math.round(kFactor(b.games) * ((1 - scoreA) - (1 - ea)));
  return {
    a: { rating: ra + da, games: (a.games | 0) + 1, delta: da },
    b: { rating: rb + db, games: (b.games | 0) + 1, delta: db },
  };
}
function num(r) { r = Math.round(+r); return Number.isFinite(r) ? r : DEFAULT_RATING; }

/** Bộ điểm đầy đủ cho mọi kiểu cờ (điền mặc định khi thiếu) */
function normalizeRatings(src) {
  const out = {};
  for (const v of VARIANTS) {
    const r = src && src[v];
    out[v] = { rating: r ? num(r.rating) : DEFAULT_RATING, games: r ? Math.max(0, r.games | 0) : 0 };
  }
  return out;
}

module.exports = { DEFAULT_RATING, VARIANTS, PROVISIONAL_GAMES, kFactor, expected, update, normalizeRatings };
