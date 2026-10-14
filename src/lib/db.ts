import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// The site's one SQLite database: the treasury ledger and settings, the timeline and goals,
// contributor sign-ups from /development, and a log of the emails sent about them.
// Tables are created on first use, so a new or existing database file just works.

const DB_PATH = path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'closet-republic.db'));

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fund TEXT NOT NULL CHECK (fund IN ('budget', 'legal')),
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
`;

const globalForDb = globalThis as unknown as { crDb?: Database.Database };

export function db() {
  if (globalForDb.crDb) return globalForDb.crDb;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const conn = new Database(DB_PATH);
  conn.pragma('journal_mode = WAL');
  conn.exec(SCHEMA);
  globalForDb.crDb = conn;
  return conn;
}
