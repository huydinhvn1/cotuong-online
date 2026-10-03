/* Kho người dùng: Postgres khi có DATABASE_URL (vd. Supabase), ngược lại dùng file JSON (chạy trên máy).
   Giao diện chung (đều trả Promise):
     init()                                          tạo bảng / đọc file
     upsertOAuthUser({provider, providerId, name, avatar}) -> user   (tạo mới hoặc cập nhật tên/ảnh, giữ id + thống kê)
     getUser(id) -> user | null
     recordResult(id, 'win' | 'loss' | 'draw') -> user | null
     recordRatedGame({r, b, variant, winner: 'r'|'b'|null}) -> {r: {before, after, delta, games}, b: {...}} | null
                                                     (cập nhật Elo cả hai người trong một giao dịch)
   Tin nhắn riêng giữa hai người đã đăng nhập + danh sách chặn:
     sendMessage({from, to, body}) -> msg {id, from, to, body, createdAt, readAt: null} | null (người nhận không tồn tại)
     listConversations(uid) -> [{peer, last: {id, from, body, createdAt}, unread}]   (mới nhất trước, tối đa 100)
     getThread(uid, peer, {limit, before}) -> [msg]  (cũ -> mới; tối đa 100)
     markRead(uid, peer) -> số tin vừa đánh dấu đã đọc;  unreadCount(uid) -> số tin chưa đọc
     block(owner, target) / unblock(owner, target) / isBlocked(owner, target) -> boolean / listBlocked(owner) -> [id]
     close()
   user = {id, provider, providerId, name, avatar, createdAt (ISO), wins, losses, draws,
           ratings: {standard: {rating, games}, jieqi: {rating, games}}}
   Postgres: Elo nằm ở bảng riêng <bảng>_ratings; tin nhắn ở cotuong_messages, danh sách chặn ở cotuong_blocks
  (tên theo bảng người dùng: <tiền tố>_users -> <tiền tố>_messages / <tiền tố>_blocks; tạo bằng CREATE TABLE IF NOT EXISTS,
  không đụng dữ liệu cũ; xoá người dùng thì tin nhắn + chặn của họ bị xoá theo - ON DELETE CASCADE). */
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
const MSG_MAX = 500;
/** Nội dung tin nhắn: bỏ ký tự điều khiển (giữ xuống dòng), gộp dòng trống, tối đa 500 ký tự. Rỗng -> '' */
function cleanBody(s) {
  return Array.from(String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim()).slice(0, MSG_MAX).join('').trim();
}
function msgArgs(o) {
  const from = String(o && o.from), to = String(o && o.to), body = cleanBody(o && o.body);
  if (!body) throw new Error('tin nhắn rỗng');
  if (from === to) throw new Error('không thể tự nhắn cho mình');
  return { from, to, body };
}
const clampLimit = n => Math.max(1, Math.min(100, (n | 0) || 50));
function normalizeProfile(p) {
  const provider = cleanStr(p.provider, 20), providerId = cleanStr(p.providerId, 128);
  if (!provider || !providerId) throw new Error('provider và providerId là bắt buộc');
  let avatar = cleanStr(p.avatar, 1000);
  if (avatar && !/^https:\/\//i.test(avatar)) avatar = '';
  return { provider, providerId, name: cleanStr(p.name, 40) || 'Kỳ thủ', avatar };
}

// ---------------- File JSON ----------------
class JsonStore {
  constructor(file) { this.file = file; this.users = new Map(); this.messages = []; this.blocks = new Set(); this.msgSeq = 0; this.chain = Promise.resolve(); }
  async init() {
    try {
      const data = JSON.parse(await fs.promises.readFile(this.file, 'utf8'));
      for (const u of data.users || []) this.users.set(u.id, u);
      this.messages = Array.isArray(data.messages) ? data.messages : [];
      for (const b of data.blocks || []) this.blocks.add(b.owner + '>' + b.target);
      this.msgSeq = this.messages.reduce((m, x) => Math.max(m, x.id | 0), 0);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    return this;
  }
  _save() {
    // ghi tuần tự, ghi file tạm rồi đổi tên để không hỏng file khi đang ghi
    const blocks = [...this.blocks].map(k => { const [owner, target] = k.split('>'); return { owner, target }; });
    const snapshot = JSON.stringify({ users: [...this.users.values()], messages: this.messages, blocks }, null, 1);
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
  // ----- tin nhắn riêng -----
  async sendMessage(o) {
    const a = msgArgs(o);
    if (!this.users.has(a.from) || !this.users.has(a.to)) return null;
    const m = { id: ++this.msgSeq, from: a.from, to: a.to, body: a.body, createdAt: new Date().toISOString(), readAt: null };
    this.messages.push(m);
    if (this.messages.length > 50000) this.messages.splice(0, this.messages.length - 50000); // file JSON chỉ để chạy trên máy: giữ 50k tin gần nhất
    await this._save();
    return { ...m };
  }
  async listConversations(uid) {
    uid = String(uid); const by = new Map();
    for (const m of this.messages) {
      if (m.from !== uid && m.to !== uid) continue;
      const peer = m.from === uid ? m.to : m.from;
      const c = by.get(peer) || { peer, last: null, unread: 0 };
      c.last = { id: m.id, from: m.from, body: m.body, createdAt: m.createdAt };
      if (m.to === uid && !m.readAt) c.unread++;
      by.set(peer, c);
    }
    return [...by.values()].sort((x, y) => y.last.id - x.last.id).slice(0, 100);
  }
  async getThread(uid, peer, opt) {
    uid = String(uid); peer = String(peer); const limit = clampLimit(opt && opt.limit), before = opt && opt.before ? +opt.before : Infinity;
    const out = this.messages.filter(m => m.id < before && ((m.from === uid && m.to === peer) || (m.from === peer && m.to === uid)));
    return out.slice(-limit).map(m => ({ ...m }));
  }
  async markRead(uid, peer) {
    uid = String(uid); peer = String(peer); let n = 0; const now = new Date().toISOString();
    for (const m of this.messages) if (m.to === uid && m.from === peer && !m.readAt) { m.readAt = now; n++; }
    if (n) await this._save();
    return n;
  }
  async unreadCount(uid) { uid = String(uid); let n = 0; for (const m of this.messages) if (m.to === uid && !m.readAt) n++; return n; }
  async block(owner, target) {
    owner = String(owner); target = String(target);
    if (owner === target || !this.users.has(owner) || !this.users.has(target)) return false;
    this.blocks.add(owner + '>' + target); await this._save(); return true;
  }
  async unblock(owner, target) { const ok = this.blocks.delete(String(owner) + '>' + String(target)); if (ok) await this._save(); return ok; }
  async isBlocked(owner, target) { return this.blocks.has(String(owner) + '>' + String(target)); }
  async listBlocked(owner) { const p = String(owner) + '>'; return [...this.blocks].filter(k => k.startsWith(p)).map(k => k.slice(p.length)); }
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
    const base = this.table.replace(/_users$/, '');
    this.mtable = base + '_messages'; this.btable = base + '_blocks'; // mặc định: cotuong_messages, cotuong_blocks
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
    // Tin nhắn riêng + danh sách chặn: bảng riêng, chỉ thêm mới
    await this.pool.query(`CREATE TABLE IF NOT EXISTS ${this.mtable} (
      id bigserial PRIMARY KEY, sender uuid NOT NULL REFERENCES ${this.table}(id) ON DELETE CASCADE,
      recipient uuid NOT NULL REFERENCES ${this.table}(id) ON DELETE CASCADE, body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND ${MSG_MAX}),
      created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz)`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS ${this.mtable}_recipient_idx ON ${this.mtable} (recipient, read_at)`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS ${this.mtable}_pair_idx ON ${this.mtable} (LEAST(sender, recipient), GREATEST(sender, recipient), id)`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS ${this.btable} (
      owner uuid NOT NULL REFERENCES ${this.table}(id) ON DELETE CASCADE, target uuid NOT NULL REFERENCES ${this.table}(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (owner, target))`);
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
  // ----- tin nhắn riêng -----
  static msg(r) { return { id: Number(r.id), from: r.sender, to: r.recipient, body: r.body, createdAt: new Date(r.created_at).toISOString(), readAt: r.read_at ? new Date(r.read_at).toISOString() : null }; }
  async sendMessage(o) {
    const a = msgArgs(o);
    if (!UUID_RE.test(a.from) || !UUID_RE.test(a.to)) return null;
    const { rows } = await this.pool.query(
      `INSERT INTO ${this.mtable} (sender, recipient, body) SELECT $1, $2, $3
       WHERE (SELECT count(*) FROM ${this.table} WHERE id IN ($1, $2)) = 2 RETURNING *`, [a.from, a.to, a.body]);
    return rows[0] ? PgStore.msg(rows[0]) : null;
  }
  async listConversations(uid) {
    if (!UUID_RE.test(String(uid))) return [];
    const { rows } = await this.pool.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (peer) peer, id, sender, body, created_at FROM (
           SELECT CASE WHEN sender = $1 THEN recipient ELSE sender END AS peer, id, sender, body, created_at
           FROM ${this.mtable} WHERE sender = $1 OR recipient = $1) t
         ORDER BY peer, id DESC) last
       ORDER BY id DESC LIMIT 100`, [uid]);
    const unread = await this.pool.query(`SELECT sender, count(*)::int AS n FROM ${this.mtable} WHERE recipient = $1 AND read_at IS NULL GROUP BY sender`, [uid]);
    const un = new Map(unread.rows.map(r => [r.sender, r.n]));
    return rows.map(r => ({ peer: r.peer, last: { id: Number(r.id), from: r.sender, body: r.body, createdAt: new Date(r.created_at).toISOString() }, unread: un.get(r.peer) || 0 }));
  }
  async getThread(uid, peer, opt) {
    if (!UUID_RE.test(String(uid)) || !UUID_RE.test(String(peer))) return [];
    const limit = clampLimit(opt && opt.limit), before = opt && opt.before ? Math.max(0, +opt.before | 0) : null;
    const { rows } = await this.pool.query(
      `SELECT * FROM ${this.mtable} WHERE ((sender = $1 AND recipient = $2) OR (sender = $2 AND recipient = $1))
       AND ($3::bigint IS NULL OR id < $3) ORDER BY id DESC LIMIT $4`, [uid, peer, before, limit]);
    return rows.reverse().map(PgStore.msg);
  }
  async markRead(uid, peer) {
    if (!UUID_RE.test(String(uid)) || !UUID_RE.test(String(peer))) return 0;
    const r = await this.pool.query(`UPDATE ${this.mtable} SET read_at = now() WHERE recipient = $1 AND sender = $2 AND read_at IS NULL`, [uid, peer]);
    return r.rowCount;
  }
  async unreadCount(uid) {
    if (!UUID_RE.test(String(uid))) return 0;
    const { rows } = await this.pool.query(`SELECT count(*)::int AS n FROM ${this.mtable} WHERE recipient = $1 AND read_at IS NULL`, [uid]);
    return rows[0].n;
  }
  async block(owner, target) {
    if (!UUID_RE.test(String(owner)) || !UUID_RE.test(String(target)) || owner === target) return false;
    const r = await this.pool.query(
      `INSERT INTO ${this.btable} (owner, target) SELECT $1, $2 WHERE (SELECT count(*) FROM ${this.table} WHERE id IN ($1, $2)) = 2
       ON CONFLICT DO NOTHING`, [owner, target]);
    return r.rowCount > 0 || this.isBlocked(owner, target);
  }
  async unblock(owner, target) {
    if (!UUID_RE.test(String(owner)) || !UUID_RE.test(String(target))) return false;
    return (await this.pool.query(`DELETE FROM ${this.btable} WHERE owner = $1 AND target = $2`, [owner, target])).rowCount > 0;
  }
  async isBlocked(owner, target) {
    if (!UUID_RE.test(String(owner)) || !UUID_RE.test(String(target))) return false;
    return (await this.pool.query(`SELECT 1 FROM ${this.btable} WHERE owner = $1 AND target = $2`, [owner, target])).rowCount > 0;
  }
  async listBlocked(owner) {
    if (!UUID_RE.test(String(owner))) return [];
    return (await this.pool.query(`SELECT target FROM ${this.btable} WHERE owner = $1 ORDER BY created_at`, [owner])).rows.map(r => r.target);
  }
  async close() { await this.pool.end(); }
}

function createStore(env) {
  env = env || process.env;
  if (env.DATABASE_URL) return new PgStore(env.DATABASE_URL, env.USERS_TABLE ? { table: env.USERS_TABLE } : undefined);
  return new JsonStore(env.USERS_FILE || path.join(__dirname, '..', 'data', 'users.json'));
}

module.exports = { createStore, JsonStore, PgStore, cleanBody, MSG_MAX };
