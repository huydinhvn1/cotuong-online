/* Hồ sơ công khai của người chơi (thẻ "Thông tin người chơi").
   Chỉ liệt kê rõ từng trường được phép lộ ra: KHÔNG có providerId hay bất kỳ định danh nào của Google/Facebook. */
'use strict';
const Rating = require('./rating');

const PROVIDERS = new Set(['google', 'facebook']);
function publicProfile(u) {
  if (!u) return null;
  const ratings = Rating.normalizeRatings(u.ratings);
  const wins = u.wins | 0, losses = u.losses | 0, draws = u.draws | 0;
  return {
    id: String(u.id), name: String(u.name || 'Kỳ thủ'), avatar: /^https:\/\//i.test(u.avatar || '') ? u.avatar : '',
    provider: PROVIDERS.has(u.provider) ? u.provider : 'other', guest: false,
    ratings, wins, losses, draws, games: wins + losses + draws,
    ratedGames: Rating.VARIANTS.reduce((n, v) => n + (ratings[v].games | 0), 0),
    joinedAt: u.createdAt || null,
  };
}
/** Thông tin tối thiểu để hiện trong hộp thư (tên + ảnh) */
const miniProfile = u => u ? { id: String(u.id), name: String(u.name || 'Kỳ thủ'), avatar: /^https:\/\//i.test(u.avatar || '') ? u.avatar : '' } : null;
const PUBLIC_FIELDS = ['id', 'name', 'avatar', 'provider', 'guest', 'ratings', 'wins', 'losses', 'draws', 'games', 'ratedGames', 'joinedAt'];
module.exports = { publicProfile, miniProfile, PUBLIC_FIELDS };
