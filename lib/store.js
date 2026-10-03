/* Kho người dùng: Postgres khi có DATABASE_URL (vd. Supabase), ngược lại dùng file JSON (chạy trên máy).
   Giao diện chung (đều trả Promise):
     init()                                          tạo bảng / đọc file
     upsertOAuthUser({provider, providerId, name, avatar}) -> user   (tạo mới hoặc cập nhật tên/ảnh, giữ id + thống kê)
     getUser(id) -> user | null
     recordResult(id, 'win' | 'loss' | 'draw') -> user | null
     close()
   user = {id, provider, providerId, name, avatar, createdAt (ISO), wins, losses, draws} */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RESULT_COL = { win: 'wins', loss: 'losses', draw: 'draws' };
const cleanStr = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
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
    return { ...u };
  }
  async getUser(id) { const u = this.users.get(String(id)); return u ? { ...u } : null; }
  async recordResult(id, result) {
    const col = RESULT_COL[result]; if (!col) throw new Error('kết quả không hợp lệ: ' + result);
    const u = this.users.get(String(id)); if (!u) return null;
    u[col] = (u[col] || 0) + 1;
    await this._save();
    return { ...u };
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
    if (!/^[a-z_][a-z0-9_]*$/.test(this.table)) throw new Error('tên bảng không hợp lệ');
  }
  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS ${this.table} (
      id uuid PRIMARY KEY, provider text NOT NULL, provider_id text NOT NULL, name text NOT NULL, avatar text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(), wins integer NOT NULL DEFAULT 0, losses integer NOT NULL DEFAULT 0,
      draws integer NOT NULL DEFAULT 0, UNIQUE (provider, provider_id))`);
    return this;
  }
  static row(r) {
    return r ? { id: r.id, provider: r.provider, providerId: r.provider_id, name: r.name, avatar: r.avatar,
      createdAt: new Date(r.created_at).toISOString(), wins: r.wins, losses: r.losses, draws: r.draws } : null;
  }
  async upsertOAuthUser(p) {
    const n = normalizeProfile(p);
    const { rows } = await this.pool.query(
      `INSERT INTO ${this.table} (id, provider, provider_id, name, avatar) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider, provider_id) DO UPDATE SET name = EXCLUDED.name, avatar = EXCLUDED.avatar RETURNING *`,
      [crypto.randomUUID(), n.provider, n.providerId, n.name, n.avatar]);
    return PgStore.row(rows[0]);
  }
  async getUser(id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
    const { rows } = await this.pool.query(`SELECT * FROM ${this.table} WHERE id = $1`, [id]);
    return PgStore.row(rows[0]);
  }
  async recordResult(id, result) {
    const col = RESULT_COL[result]; if (!col) throw new Error('kết quả không hợp lệ: ' + result);
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
    const { rows } = await this.pool.query(`UPDATE ${this.table} SET ${col} = ${col} + 1 WHERE id = $1 RETURNING *`, [id]);
    return PgStore.row(rows[0]);
  }
  async close() { await this.pool.end(); }
}

function createStore(env) {
  env = env || process.env;
  if (env.DATABASE_URL) return new PgStore(env.DATABASE_URL, env.USERS_TABLE ? { table: env.USERS_TABLE } : undefined);
  return new JsonStore(env.USERS_FILE || path.join(__dirname, '..', 'data', 'users.json'));
}

module.exports = { createStore, JsonStore, PgStore };
