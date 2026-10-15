// The bot's view of the site's SQLite database (the site creates the tables).
import Database from 'better-sqlite3';

const REQUIRED = ['memberships', 'discord_members', 'discord_grants', 'discord_notices'];

export function openStore(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  const have = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
  const missing = REQUIRED.filter((t) => !have.has(t));
  if (missing.length) throw new Error(`The site's database at ${dbPath} has no ${missing.join(', ')} table. Start (or update) the site first, then the bot.`);
  const nowIso = () => new Date().toISOString();

  return {
    db,
    member: (id) => db.prepare('SELECT * FROM discord_members WHERE discord_id = ?').get(id) ?? null,
    memberByEmail: (email) => db.prepare('SELECT * FROM discord_members WHERE email = ?').get(email) ?? null,
    membershipsFor: (email) => (email ? db.prepare('SELECT * FROM memberships WHERE email = ?').all(email) : []),
    grantsFor: (id) => db.prepare('SELECT * FROM discord_grants WHERE discord_id = ?').all(id),
    /** Everyone the bot looks after: linked members, members with grants, and anyone it gave a role. */
    managedIds: () =>
      db
        .prepare('SELECT discord_id FROM discord_members UNION SELECT discord_id FROM discord_grants')
        .all()
        .map((r) => r.discord_id),
    ensureMember: (id) =>
      db.prepare('INSERT INTO discord_members (discord_id, updated_at) VALUES (?, ?) ON CONFLICT(discord_id) DO NOTHING').run(id, nowIso()),
    setApplied: (id, tier, state) =>
      db.prepare('UPDATE discord_members SET applied_tier = ?, applied_state = ?, updated_at = ? WHERE discord_id = ?').run(tier, state, nowIso(), id),
    setFlag: (id, flag, on) => {
      if (!['discreet', 'thanks'].includes(flag)) throw new Error('bad flag');
      db.prepare('INSERT INTO discord_members (discord_id, updated_at) VALUES (?, ?) ON CONFLICT(discord_id) DO NOTHING').run(id, nowIso());
      db.prepare(`UPDATE discord_members SET ${flag} = ?, updated_at = ? WHERE discord_id = ?`).run(on ? 1 : 0, nowIso(), id);
    },
    /** Unlink: forget the email, keep the current class for the grace period. */
    unlink: (id, graceDays) => {
      const m = db.prepare('SELECT applied_tier FROM discord_members WHERE discord_id = ? AND email IS NOT NULL').get(id);
      if (!m) return false;
      const until = m.applied_tier ? new Date(Date.now() + graceDays * 86_400_000).toISOString() : null;
      db.prepare('UPDATE discord_members SET email = NULL, linked_at = NULL, carry_tier = ?, carry_until = ?, updated_at = ? WHERE discord_id = ?')
        .run(until ? m.applied_tier : null, until, nowIso(), id);
      return true;
    },
    /** /forget-me: delete everything the bot and the link page hold about this Discord account. */
    forget: (id) =>
      db.transaction(() => {
        for (const table of ['discord_members', 'discord_grants', 'discord_notices', 'discord_link_codes']) {
          db.prepare(`DELETE FROM ${table} WHERE discord_id = ?`).run(id);
        }
      })(),
    grant: (id, tier, days, by) => {
      db.prepare('INSERT INTO discord_members (discord_id, updated_at) VALUES (?, ?) ON CONFLICT(discord_id) DO NOTHING').run(id, nowIso());
      const expires = new Date(Date.now() + days * 86_400_000).toISOString();
      db.prepare('INSERT INTO discord_grants (discord_id, tier, expires_at, granted_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, tier, expires, by, nowIso());
      return expires;
    },
    /** Founder revoke (refunds, chargebacks): no grace period. */
    revoke: (id) =>
      db.transaction(() => {
        const m = db.prepare('SELECT email FROM discord_members WHERE discord_id = ?').get(id);
        if (m?.email) db.prepare("UPDATE memberships SET status = 'revoked', updated_at = ? WHERE email = ?").run(nowIso(), m.email);
        db.prepare('DELETE FROM discord_grants WHERE discord_id = ?').run(id);
        db.prepare('UPDATE discord_members SET carry_tier = NULL, carry_until = NULL, updated_at = ? WHERE discord_id = ?').run(nowIso(), id);
      })(),
    /** Records a message once per key. Returns false if this key was already sent. */
    notice: (id, key, message, delivered) =>
      db
        .prepare('INSERT OR IGNORE INTO discord_notices (discord_id, notice_key, message, delivered, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, key, message, delivered ? 1 : 0, nowIso()).changes === 1,
    hasNotice: (id, key) => Boolean(db.prepare('SELECT 1 FROM discord_notices WHERE discord_id = ? AND notice_key = ?').get(id, key)),
    markDelivered: (id, key) => db.prepare('UPDATE discord_notices SET delivered = 1 WHERE discord_id = ? AND notice_key = ?').run(id, key),
    undelivered: (id) =>
      db.prepare('SELECT notice_key, message FROM discord_notices WHERE discord_id = ? AND delivered = 0 ORDER BY created_at').all(id),
    activeMemberships: () => db.prepare("SELECT * FROM memberships WHERE status = 'active'").all(),
    lapse: (subscriptionId) =>
      db.prepare("UPDATE memberships SET status = 'lapsed', ended_at = ?, updated_at = ? WHERE subscription_id = ? AND status = 'active'").run(nowIso(), nowIso(), subscriptionId),
    setPaidUntil: (subscriptionId, iso) =>
      db.prepare('UPDATE memberships SET paid_until = ?, updated_at = ? WHERE subscription_id = ?').run(iso, nowIso(), subscriptionId),
    levelsSeen: () => db.prepare('SELECT DISTINCT level_id, level_name FROM memberships').all(),
  };
}
