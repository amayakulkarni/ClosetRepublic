import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// The Republic's treasury: one SQLite ledger for two funds.
//  - "budget": the monthly budget. Only entries from the current month count, so it
//    starts again from zero on the 1st of every month (in FUNDING_TIMEZONE).
//  - "legal": the legal fund, a running balance that never resets.
// Every change is a ledger entry (donation, refund, credit, deduction, adjustment), so
// the history stays auditable; nothing is ever overwritten in place.

export type Fund = 'budget' | 'legal';
export type EntryKind = 'donation' | 'refund' | 'credit' | 'deduction' | 'adjustment';
export const FUNDS: Fund[] = ['budget', 'legal'];
export const KINDS: EntryKind[] = ['donation', 'refund', 'credit', 'deduction', 'adjustment'];

export type LedgerEntry = {
  id: number;
  fund: Fund;
  kind: EntryKind;
  /** Signed amount in the fund currency, in minor units (paise / cents). */
  amountMinor: number;
  originalAmount: number | null;
  originalCurrency: string | null;
  source: 'buymeacoffee' | 'admin';
  externalId: string | null;
  supporterName: string | null;
  note: string | null;
  month: string; // YYYY-MM in FUNDING_TIMEZONE
  createdAt: string; // ISO
};

export type Settings = {
  budgetGoal: number; // monthly, major units
  legalGoal: number; // major units, 0 = no target
  donationFund: Fund; // where Buy Me a Coffee money goes
};

export const CURRENCY = process.env.FUNDING_CURRENCY || 'INR';
export const TIMEZONE = process.env.FUNDING_TIMEZONE || 'Asia/Kolkata';
const DB_PATH = path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'closet-republic.db'));

type Row = {
  id: number;
  fund: Fund;
  kind: EntryKind;
  amount_minor: number;
  original_amount: number | null;
  original_currency: string | null;
  source: 'buymeacoffee' | 'admin';
  external_id: string | null;
  supporter_name: string | null;
  note: string | null;
  month: string;
  created_at: string;
};

const globalForDb = globalThis as unknown as { crDb?: Database.Database };

function db() {
  if (globalForDb.crDb) return globalForDb.crDb;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const conn = new Database(DB_PATH);
  conn.pragma('journal_mode = WAL');
  conn.exec(`
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
  `);
  globalForDb.crDb = conn;
  return conn;
}

const toEntry = (r: Row): LedgerEntry => ({
  id: r.id,
  fund: r.fund,
  kind: r.kind,
  amountMinor: r.amount_minor,
  originalAmount: r.original_amount,
  originalCurrency: r.original_currency,
  source: r.source,
  externalId: r.external_id,
  supporterName: r.supporter_name,
  note: r.note,
  month: r.month,
  createdAt: r.created_at,
});

export const toMinor = (major: number) => Math.round(major * 100);
export const toMajor = (minor: number) => minor / 100;

/** "YYYY-MM" for a date in the funding time zone. */
export function monthOf(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit' }).formatToParts(date);
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
}

export function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ---------- settings ----------

export function getSettings(): Settings {
  const rows = db().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    budgetGoal: Number(s.budgetGoal ?? process.env.FUNDING_GOAL ?? 0) || 0,
    legalGoal: Number(s.legalGoal ?? process.env.LEGAL_FUND_GOAL ?? 0) || 0,
    donationFund: s.donationFund === 'legal' ? 'legal' : 'budget',
  };
}

export function updateSettings(patch: Partial<Settings>) {
  const put = db().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db().transaction(() => {
    if (patch.budgetGoal !== undefined) put.run('budgetGoal', String(Math.max(0, patch.budgetGoal)));
    if (patch.legalGoal !== undefined) put.run('legalGoal', String(Math.max(0, patch.legalGoal)));
    if (patch.donationFund !== undefined) put.run('donationFund', patch.donationFund);
  });
  tx();
  return getSettings();
}

// ---------- ledger ----------

export type NewEntry = {
  fund: Fund;
  kind: EntryKind;
  amountMinor: number;
  source: LedgerEntry['source'];
  externalId?: string | null;
  originalAmount?: number | null;
  originalCurrency?: string | null;
  supporterName?: string | null;
  note?: string | null;
  createdAt?: Date;
};

/** Adds an entry. Returns null when an entry with the same external id already exists (webhook retries). */
export function addEntry(e: NewEntry): LedgerEntry | null {
  const created = e.createdAt ?? new Date();
  const info = db()
    .prepare(
      `INSERT INTO ledger (fund, kind, amount_minor, original_amount, original_currency, source, external_id, supporter_name, note, month, created_at)
       VALUES (@fund, @kind, @amountMinor, @originalAmount, @originalCurrency, @source, @externalId, @supporterName, @note, @month, @createdAt)
       ON CONFLICT(external_id) DO NOTHING`,
    )
    .run({
      fund: e.fund,
      kind: e.kind,
      amountMinor: e.amountMinor,
      originalAmount: e.originalAmount ?? null,
      originalCurrency: e.originalCurrency ?? null,
      source: e.source,
      externalId: e.externalId ?? null,
      supporterName: e.supporterName ?? null,
      note: e.note ?? null,
      month: monthOf(created),
      createdAt: created.toISOString(),
    });
  if (info.changes === 0) return null;
  return getEntry(Number(info.lastInsertRowid));
}

export function getEntry(id: number): LedgerEntry | null {
  const row = db().prepare('SELECT * FROM ledger WHERE id = ?').get(id) as Row | undefined;
  return row ? toEntry(row) : null;
}

export function deleteEntry(id: number) {
  return db().prepare('DELETE FROM ledger WHERE id = ?').run(id).changes > 0;
}

export function listEntries(opts: { fund?: Fund; month?: string; limit?: number } = {}): LedgerEntry[] {
  const where: string[] = [];
  const params: Record<string, unknown> = { limit: Math.min(opts.limit ?? 200, 1000) };
  if (opts.fund) {
    where.push('fund = @fund');
    params.fund = opts.fund;
  }
  if (opts.month) {
    where.push('month = @month');
    params.month = opts.month;
  }
  const sql = `SELECT * FROM ledger ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT @limit`;
  return (db().prepare(sql).all(params) as Row[]).map(toEntry);
}

const sum = (sql: string, ...args: unknown[]) => (db().prepare(sql).get(...args) as { total: number | null }).total ?? 0;

/** Balance of the legal fund, in minor units. */
export const legalBalanceMinor = () => sum("SELECT SUM(amount_minor) total FROM ledger WHERE fund = 'legal'");

/** What the monthly budget has raised (net of refunds and deductions) in a month, in minor units. */
export const budgetForMonthMinor = (month = monthOf()) => sum("SELECT SUM(amount_minor) total FROM ledger WHERE fund = 'budget' AND month = ?", month);

/** Sets the legal fund to an exact balance by recording an adjustment for the difference. */
export function setLegalBalance(targetMinor: number, note?: string) {
  const diff = targetMinor - legalBalanceMinor();
  if (diff === 0) return null;
  return addEntry({ fund: 'legal', kind: 'adjustment', amountMinor: diff, source: 'admin', note: note || 'Balance set by admin' });
}

/** Monthly budget totals, newest first, for the admin history. */
export function budgetHistory(months = 12) {
  return db()
    .prepare("SELECT month, SUM(amount_minor) total FROM ledger WHERE fund = 'budget' GROUP BY month ORDER BY month DESC LIMIT ?")
    .all(months) as { month: string; total: number }[];
}

export type FundsSummary = {
  currency: string;
  month: string;
  monthLabel: string;
  budget: { raised: number; goal: number };
  legal: { balance: number; goal: number };
  donationFund: Fund;
};

/** Public numbers for the funding page and GET /api/funds (major units). */
export function getSummary(): FundsSummary {
  const settings = getSettings();
  const month = monthOf();
  return {
    currency: CURRENCY,
    month,
    monthLabel: monthLabel(month),
    budget: { raised: toMajor(budgetForMonthMinor(month)), goal: settings.budgetGoal },
    legal: { balance: toMajor(legalBalanceMinor()), goal: settings.legalGoal },
    donationFund: settings.donationFund,
  };
}
