/* Kho tài khoản cho https://huydinh.app/cotuong/: Postgres khi có DATABASE_URL, ngược lại file JSON (chạy trên máy).
     init()                                               tạo bảng nếu chưa có (CREATE TABLE IF NOT EXISTS, không đụng bảng/dữ liệu cũ)
     upsertOAuthUser({provider, providerId, name, avatar}) -> user
     getUser(id) -> user | null
     getPrefs(uid) -> {phrases, name, avatar} | null;  setPrefs(uid, data) -> boolean
     close()
   Bảng dùng: cotuong_users (người dùng Google), cotuong_hd_prefs (câu nói nhanh, tên, ảnh). Các bảng cũ của cotuongvn.net
   (cotuong_users_ratings, cotuong_messages, cotuong_blocks) giữ nguyên trong DB nhưng không còn dùng. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cleanStr = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const UUID_RE = /^[0-9a-f-]{36}$/i;
function normalizeProfile(p) {
  const provider = cleanStr(p.provider, 20), providerId = cleanStr(p.providerId, 128);
  if (!provider || !providerId) throw new Error('provider và providerId là bắt buộc');
  let avatar = cleanStr(p.avatar, 1000);
  if (avatar && !/^https:\/\//i.test(avatar)) avatar = '';
  const email = /^[^\s@<>]+@[^\s@<>]+$/.test(cleanStr(p.email, 200)) ? cleanStr(p.email, 200) : '';
  return { provider, providerId, name: cleanStr(p.name, 40) || 'Kỳ thủ', avatar, email };
}
const out = u => u ? { id: u.id, provider: u.provider, providerId: u.providerId, name: u.name, avatar: u.avatar || '', email: u.email || '', createdAt: u.createdAt } : null;

class JsonStore {
  constructor(file) { this.file = file; this.users = new Map(); this.prefs = new Map(); this.chain = Promise.resolve(); this.extra = {}; }
  async init() {
    try {
      const data = JSON.parse(await fs.promises.readFile(this.file, 'utf8'));
      for (const u of data.users || []) this.users.set(u.id, u);
      for (const [k, v] of Object.entries(data.prefs || {})) this.prefs.set(k, v);
      const { users, prefs, ...rest } = data; this.extra = rest; // dữ liệu cũ giữ nguyên khi ghi lại
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    return this;
  }
  _save() {
    const snapshot = JSON.stringify({ ...this.extra, users: [...this.users.values()], prefs: Object.fromEntries(this.prefs) }, null, 1);
    this.chain = this.chain.then(async () => {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.' + process.pid + '.tmp';
      await fs.promises.writeFile(tmp, snapshot); await fs.promises.rename(tmp, this.file);
    });
    return this.chain;
  }
  async upsertOAuthUser(p) {
    const n = normalizeProfile(p);
    let u = [...this.users.values()].find(x => x.provider === n.provider && x.providerId === n.providerId);
    if (u) { u.name = n.name; u.avatar = n.avatar; u.email = n.email; }
    else { u = { id: crypto.randomUUID(), ...n, createdAt: new Date().toISOString() }; this.users.set(u.id, u); }
    await this._save(); return out(u);
  }
  async getUser(id) { return out(this.users.get(String(id))); }
  async getPrefs(uid) { return this.prefs.get(String(uid)) || null; }
  async setPrefs(uid, data) { if (!this.users.has(String(uid))) return false; this.prefs.set(String(uid), data); await this._save(); return true; }
  async close() { await this.chain; }
}

class PgStore {
  constructor(url, opts) {
    const { Pool } = require('pg');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || /sslmode=disable/.test(url);
    this.pool = new Pool({ connectionString: url, max: 5, ssl: local ? false : { rejectUnauthorized: false } });
    this.table = (opts && opts.table) || 'cotuong_users';
    if (!/^[a-z_][a-z0-9_]*$/.test(this.table) || this.table.length > 50) throw new Error('tên bảng không hợp lệ');
    this.ptable = this.table.replace(/_users$/, '') + '_hd_prefs';
  }
  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS ${this.table} (
      id uuid PRIMARY KEY, provider text NOT NULL, provider_id text NOT NULL, name text NOT NULL, avatar text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(), wins integer NOT NULL DEFAULT 0, losses integer NOT NULL DEFAULT 0,
      draws integer NOT NULL DEFAULT 0, UNIQUE (provider, provider_id))`);
    await this.pool.query(`ALTER TABLE ${this.table} ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT ''`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS ${this.ptable} (
      user_id uuid PRIMARY KEY REFERENCES ${this.table}(id) ON DELETE CASCADE, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    return this;
  }
  static row(r) { return r ? out({ id: r.id, provider: r.provider, providerId: r.provider_id, name: r.name, avatar: r.avatar, email: r.email || '', createdAt: new Date(r.created_at).toISOString() }) : null; }
  async upsertOAuthUser(p) {
    const n = normalizeProfile(p);
    const { rows } = await this.pool.query(`INSERT INTO ${this.table} (id, provider, provider_id, name, avatar, email) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (provider, provider_id) DO UPDATE SET name = EXCLUDED.name, avatar = EXCLUDED.avatar, email = EXCLUDED.email RETURNING *`,
      [crypto.randomUUID(), n.provider, n.providerId, n.name, n.avatar, n.email]);
    return PgStore.row(rows[0]);
  }
  async getUser(id) {
    if (!UUID_RE.test(String(id))) return null;
    const { rows } = await this.pool.query(`SELECT * FROM ${this.table} WHERE id = $1`, [id]); return PgStore.row(rows[0]);
  }
  async getPrefs(uid) {
    if (!UUID_RE.test(String(uid))) return null;
    const { rows } = await this.pool.query(`SELECT data FROM ${this.ptable} WHERE user_id = $1`, [uid]); return rows[0] ? rows[0].data : null;
  }
  async setPrefs(uid, data) {
    if (!UUID_RE.test(String(uid))) return false;
    await this.pool.query(`INSERT INTO ${this.ptable} (user_id, data) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [uid, JSON.stringify(data)]);
    return true;
  }
  async close() { await this.pool.end(); }
}

function createStore(env) {
  env = env || process.env;
  if (env.DATABASE_URL) return new PgStore(env.DATABASE_URL, env.USERS_TABLE ? { table: env.USERS_TABLE } : undefined);
  return new JsonStore(env.USERS_FILE || path.join(__dirname, '..', 'data', 'users.json'));
}
module.exports = { createStore, JsonStore, PgStore };
