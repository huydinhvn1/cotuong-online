/* Kho người dùng: Postgres khi có DATABASE_URL (vd. Supabase), ngược lại dùng file JSON (chạy trên máy).
   Giao diện chung (đều trả Promise):
     init()                                          tạo bảng / đọc file
     upsertOAuthUser({provider, providerId, name, avatar}) -> user   (tạo mới hoặc cập nhật tên/ảnh, giữ id + thống kê)
     getUser(id) -> user | null
     recordResult(id, 'win' | 'loss' | 'draw') -> user | null
     recordRatedGame({r, b, variant, winner: 'r'|'b'|null}) -> {r: {before, after, delta, games}, b: {...}} | null
                                                     (cập nhật Elo cả hai người trong một giao dịch)
     close()
   user = {id, provider, providerId, name, avatar, createdAt (ISO), wins, losses, draws,
           ratings: {standard: {rating, games}, jieqi: {rating, games}}}
   Postgres: Elo nằm ở bảng riêng <bảng>_ratings (tạo bằng CREATE TABLE IF NOT EXISTS, không đụng dữ liệu cũ). */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Rating = require('./rating');

const RESULT_COL = { win: 'wins', loss: 'losses', draw: 'draws' };
const cleanStr = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const UUID_RE = /^[0-9a-f-]{36}$/i;
function ratedArgs(o) {
  const variant = String(o && o.variant), r = String(o && o.r), b = String(o && o.b), winner = o && o.winner;
  if (!Rating.VARIANTS.includes(variant)) throw new Error('kiểu cờ không hợp lệ: ' + variant);
  if (winner !== 'r' && winner !== 'b' && winner != null) throw new Error('kết quả không hợp lệ: ' + winner);
  if (r === b) throw new Error('hai người chơi phải khác nhau');
  return { variant, r, b, scoreR: winner == null ? 0.5 : winner === 'r' ? 1 : 0 };
}
function ratedResult(before, upd) {
  return {
    r: { before: before.r.rating, after: upd.a.rating, delta: upd.a.delta, games: upd.a.games },
    b: { before: before.b.rating, after: upd.b.rating, delta: upd.b.delta, games: upd.b.games },
  };
}
function normalizeProfile(p) {
  const provider = cleanStr(p.provider, 20), providerId = cleanStr(p.providerId, 128);
  if (!provider || !providerId) throw new Error('provider và providerId là bắt buộc');
  let avatar = cleanStr(p.avatar, 1000);
  if (avatar && !/^https:\/\//i.test(avatar)) avatar = '';
  return { provider, providerId, name: cleanStr(p.name, 40) || 'Kỳ thủ', avatar };
}

// ---------------- File JSON ----------------
class JsonStore {
  constructor(file) { this.file = file; this.users = new Map(); this.chain = Promise.resolve(); }
  async init() {
    try {
      const data = JSON.parse(await fs.promises.readFile(this.file, 'utf8'));
      for (const u of data.users || []) this.users.set(u.id, u);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    return this;
  }
  _save() {
    // ghi tuần tự, ghi file tạm rồi đổi tên để không hỏng file khi đang ghi
    const snapshot = JSON.stringify({ users: [...this.users.values()] }, null, 1);
    this.chain = this.chain.then(async () => {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.' + process.pid + '.tmp';
      await fs.promises.writeFile(tmp, snapshot);
      await fs.promises.rename(tmp, this.file);
    });
    return this.chain;
  }
  _find(provider, providerId) {
    for (const u of this.users.values()) if (u.provider === provider && u.providerId === providerId) return u;
    return null;
  }
  async upsertOAuthUser(p) {
    const n = normalizeProfile(p);
    let u = this._find(n.provider, n.providerId);
    if (u) { u.name = n.name; u.avatar = n.avatar; }
    else {
      u = { id: crypto.randomUUID(), provider: n.provider, providerId: n.providerId, name: n.name, avatar: n.avatar,
        createdAt: new Date().toISOString(), wins: 0, losses: 0, draws: 0 };
      this.users.set(u.id, u);
    }
    await this._save();
    return this._out(u);
  }
  _out(u) { return { ...u, ratings: Rating.normalizeRatings(u.ratings) }; }
  async getUser(id) { const u = this.users.get(String(id)); return u ? this._out(u) : null; }
  async recordRatedGame(o) {
    const a = ratedArgs(o), ur = this.users.get(a.r), ub = this.users.get(a.b);
    if (!ur || !ub) return null;
    // đọc - tính - ghi đồng bộ trong bộ nhớ nên không bị ghi đè khi nhiều ván kết thúc cùng lúc
    const before = { r: Rating.normalizeRatings(ur.ratings)[a.variant], b: Rating.normalizeRatings(ub.ratings)[a.variant] };
    const upd = Rating.update(before.r, before.b, a.scoreR);
    for (const [u, n] of [[ur, upd.a], [ub, upd.b]]) {
      u.ratings = Rating.normalizeRatings(u.ratings); u.ratings[a.variant] = { rating: n.rating, games: n.games };
    }
    await this._save();
    return ratedResult(before, upd);
  }
  async recordResult(id, result) {
    const col = RESULT_COL[result]; if (!col) throw new Error('kết quả không hợp lệ: ' + result);
    const u = this.users.get(String(id)); if (!u) return null;
    u[col] = (u[col] || 0) + 1;
    await this._save();
    return this._out(u);
  }
  async close() { await this.chain; }
}

// ---------------- Postgres ----------------
class PgStore {
  constructor(url, opts) {
    const { Pool } = require('pg'); // chỉ cần khi dùng DATABASE_URL
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || /sslmode=disable/.test(url);
    this.pool = new Pool({ connectionString: url, max: 5, ssl: local ? false : { rejectUnauthorized: false }, ...(opts || {}) });
    this.table = (opts && opts.table) || 'cotuong_users';
    if (!/^[a-z_][a-z0-9_]*$/.test(this.table) || this.table.length > 50) throw new Error('tên bảng không hợp lệ');
    this.rtable = this.table + '_ratings';
  }
  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS ${this.table} (
      id uuid PRIMARY KEY, provider text NOT NULL, provider_id text NOT NULL, name text NOT NULL, avatar text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(), wins integer NOT NULL DEFAULT 0, losses integer NOT NULL DEFAULT 0,
      draws integer NOT NULL DEFAULT 0, UNIQUE (provider, provider_id))`);
    // Elo: bảng riêng, chỉ thêm mới (bảng người dùng cũ giữ nguyên)
    await this.pool.query(`CREATE TABLE IF NOT EXISTS ${this.rtable} (
      user_id uuid NOT NULL REFERENCES ${this.table}(id) ON DELETE CASCADE, variant text NOT NULL,
      rating integer NOT NULL DEFAULT ${Rating.DEFAULT_RATING}, games integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, variant))`);
    return this;
  }
  static row(r, ratingRows) {
    if (!r) return null;
    const ratings = {};
    for (const x of ratingRows || []) ratings[x.variant] = { rating: x.rating, games: x.games };
    return { id: r.id, provider: r.provider, providerId: r.provider_id, name: r.name, avatar: r.avatar,
      createdAt: new Date(r.created_at).toISOString(), wins: r.wins, losses: r.losses, draws: r.draws, ratings: Rating.normalizeRatings(ratings) };
  }
  async _withRatings(r) {
    if (!r) return null;
    const { rows } = await this.pool.query(`SELECT variant, rating, games FROM ${this.rtable} WHERE user_id = $1`, [r.id]);
    return PgStore.row(r, rows);
  }
  async recordRatedGame(o) {
    const a = ratedArgs(o);
    if (!UUID_RE.test(a.r) || !UUID_RE.test(a.b)) return null;
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const users = await c.query(`SELECT id FROM ${this.table} WHERE id = ANY($1::uuid[])`, [[a.r, a.b]]);
      if (users.rows.length !== 2) { await c.query('ROLLBACK'); return null; }
      await c.query(`INSERT INTO ${this.rtable} (user_id, variant) VALUES ($1, $3), ($2, $3) ON CONFLICT DO NOTHING`, [a.r, a.b, a.variant]);
      // khoá 2 dòng (theo thứ tự id để tránh deadlock) rồi mới tính
      const { rows } = await c.query(`SELECT user_id, rating, games FROM ${this.rtable} WHERE variant = $1 AND user_id = ANY($2::uuid[]) ORDER BY user_id FOR UPDATE`, [a.variant, [a.r, a.b]]);
      const get = id => { const x = rows.find(q => q.user_id === id); return { rating: x.rating, games: x.games }; };
      const before = { r: get(a.r), b: get(a.b) };
      const upd = Rating.update(before.r, before.b, a.scoreR);
      for (const [id, n] of [[a.r, upd.a], [a.b, upd.b]])
        await c.query(`UPDATE ${this.rtable} SET rating = $3, games = $4, updated_at = now() WHERE user_id = $1 AND variant = $2`, [id, a.variant, n.rating, n.games]);
      await c.query('COMMIT');
      return ratedResult(before, upd);
    } catch (e) { await c.query('ROLLBACK').catch(() => { }); throw e; } finally { c.release(); }
  }
  async upsertOAuthUser(p) {
    const n = normalizeProfile(p);
    const { rows } = await this.pool.query(
      `INSERT INTO ${this.table} (id, provider, provider_id, name, avatar) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider, provider_id) DO UPDATE SET name = EXCLUDED.name, avatar = EXCLUDED.avatar RETURNING *`,
      [crypto.randomUUID(), n.provider, n.providerId, n.name, n.avatar]);
    return this._withRatings(rows[0]);
  }
  async getUser(id) {
    if (!UUID_RE.test(String(id))) return null;
    const { rows } = await this.pool.query(`SELECT * FROM ${this.table} WHERE id = $1`, [id]);
    return this._withRatings(rows[0]);
  }
  async recordResult(id, result) {
    const col = RESULT_COL[result]; if (!col) throw new Error('kết quả không hợp lệ: ' + result);
    if (!UUID_RE.test(String(id))) return null;
    const { rows } = await this.pool.query(`UPDATE ${this.table} SET ${col} = ${col} + 1 WHERE id = $1 RETURNING *`, [id]);
    return this._withRatings(rows[0]);
  }
  async close() { await this.pool.end(); }
}

function createStore(env) {
  env = env || process.env;
  if (env.DATABASE_URL) return new PgStore(env.DATABASE_URL, env.USERS_TABLE ? { table: env.USERS_TABLE } : undefined);
  return new JsonStore(env.USERS_FILE || path.join(__dirname, '..', 'data', 'users.json'));
}

module.exports = { createStore, JsonStore, PgStore };
