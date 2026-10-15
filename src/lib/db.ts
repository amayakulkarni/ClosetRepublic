import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// The site's one SQLite database: the treasury ledger and settings, the timeline and goals,
// contributor sign-ups from /development, a log of the emails sent, and the Lifeline
// subscribers who get the new address if the site is ever taken down.
// Tables are created on first use, so a new or existing database file just works.

const DB_PATH = path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'closet-republic.db'));

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fund TEXT NOT NULL CHECK (fund IN ('budget', 'legal', 'welfare', 'infrastructure')),
    pot TEXT,
    kind TEXT NOT NULL,
    amount_minor INTEGER NOT NULL,
    original_amount REAL,
    original_currency TEXT,
    source TEXT NOT NULL,
    external_id TEXT UNIQUE,
    supporter_name TEXT,
    note TEXT,
    month TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ledger_fund_month ON ledger (fund, month);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS timeline_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    link TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS timeline_date ON timeline_events (date);

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK (status IN ('planned', 'in_progress', 'achieved')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    target_date TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contributors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    area TEXT NOT NULL CHECK (area IN ('constitution', 'writing', 'art')),
    name TEXT NOT NULL,
    pronouns TEXT,
    email TEXT NOT NULL,
    portfolio_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'verifying', 'verified', 'declined')),
    admin_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS contributors_area ON contributors (area, created_at);

  CREATE TABLE IF NOT EXISTS email_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contributor_id INTEGER,
    kind TEXT NOT NULL,
    to_address TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
    error TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS email_log_contributor ON email_log (contributor_id, created_at);

  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT,
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS github_sponsors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL UNIQUE,
    login TEXT NOT NULL,
    is_public INTEGER NOT NULL,
    tier_name TEXT,
    monthly_cents INTEGER NOT NULL,
    one_time INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'cancelled')),
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Buy Me a Coffee memberships (one row per subscription), written by the webhook.
  -- The Discord bot (bot/) reads these to decide who gets which tier role.
  CREATE TABLE IF NOT EXISTS memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL COLLATE NOCASE,
    level_id TEXT,
    level_name TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'cancelling', 'paused', 'ended', 'lapsed', 'revoked')),
    paid_until TEXT,
    ended_at TEXT,
    invited_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS memberships_email ON memberships (email);

  -- Discord members the bot manages: the verified Buy Me a Coffee email they linked
  -- (null after /unlink), their privacy choices, and what the bot last applied.
  CREATE TABLE IF NOT EXISTS discord_members (
    discord_id TEXT PRIMARY KEY,
    email TEXT UNIQUE COLLATE NOCASE,
    linked_at TEXT,
    discreet INTEGER NOT NULL DEFAULT 0,
    thanks INTEGER NOT NULL DEFAULT 0,
    carry_tier TEXT,
    carry_until TEXT,
    applied_tier TEXT,
    applied_state TEXT,
    updated_at TEXT NOT NULL
  );

  -- One pending email code per Discord account while linking (hashed, 15 minutes).
  CREATE TABLE IF NOT EXISTS discord_link_codes (
    discord_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL
  );

  -- Complimentary classes granted by founders (/membership grant).
  CREATE TABLE IF NOT EXISTS discord_grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    tier TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    granted_by TEXT,
    created_at TEXT NOT NULL
  );

  -- Membership messages the bot has sent (or could not deliver yet), so none repeats.
  CREATE TABLE IF NOT EXISTS discord_notices (
    discord_id TEXT NOT NULL,
    notice_key TEXT NOT NULL,
    message TEXT NOT NULL,
    delivered INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    PRIMARY KEY (discord_id, notice_key)
  );

  CREATE TABLE IF NOT EXISTS broadcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    total INTEGER NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('sending', 'done')),
    created_at TEXT NOT NULL,
    finished_at TEXT
  );
`;

const globalForDb = globalThis as unknown as { crDb?: Database.Database };

/** Upgrades databases created before the welfare and infrastructure funds existed. */
function migrate(conn: Database.Database) {
  const ledger = conn.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ledger'").get() as { sql: string } | undefined;
  if (!ledger || ledger.sql.includes("'welfare'")) return;
  // SQLite can't change a CHECK constraint in place, so rebuild the table with the same rows.
  conn.transaction(() => {
    conn.exec('ALTER TABLE ledger RENAME TO ledger_old; DROP INDEX IF EXISTS ledger_fund_month;');
    conn.exec(SCHEMA);
    conn.exec(`INSERT INTO ledger (id, fund, kind, amount_minor, original_amount, original_currency, source, external_id, supporter_name, note, month, created_at)
      SELECT id, fund, kind, amount_minor, original_amount, original_currency, source, external_id, supporter_name, note, month, created_at FROM ledger_old`);
    conn.exec('DROP TABLE ledger_old');
  })();
}

const DAY = 24 * 60 * 60 * 1000;
let lastPurge = 0;

/**
 * Deletes data past the retention periods promised in the Privacy Policy (content/pages/privacy.md):
 * unsubscribed Lifeline addresses after 30 days, declined contributors after 90 days,
 * the email log after 12 months, ended memberships after 90 days and expired link codes.
 * Runs at most once a day.
 */
function purgeExpired(conn: Database.Database) {
  if (Date.now() - lastPurge < DAY) return;
  lastPurge = Date.now();
  const before = (days: number) => new Date(Date.now() - days * DAY).toISOString();
  conn.prepare("DELETE FROM subscribers WHERE status = 'unsubscribed' AND updated_at < ?").run(before(30));
  conn.prepare("DELETE FROM contributors WHERE status = 'declined' AND updated_at < ?").run(before(90));
  conn.prepare('DELETE FROM email_log WHERE created_at < ?').run(before(365));
  conn.prepare('DELETE FROM discord_link_codes WHERE expires_at < ?').run(new Date().toISOString());
  // Memberships that ended more than 90 days ago (well past the 7-day grace period).
  conn.prepare("DELETE FROM memberships WHERE status IN ('ended', 'lapsed', 'revoked') AND updated_at < ?").run(before(90));
  conn.prepare('DELETE FROM discord_notices WHERE created_at < ?').run(before(90));
}

export function db() {
  if (globalForDb.crDb) {
    purgeExpired(globalForDb.crDb);
    return globalForDb.crDb;
  }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const conn = new Database(DB_PATH);
  conn.pragma('journal_mode = WAL');
  migrate(conn);
  conn.exec(SCHEMA);
  purgeExpired(conn);
  globalForDb.crDb = conn;
  return conn;
}
