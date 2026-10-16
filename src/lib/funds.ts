import 'server-only';
import { db } from './db';

// The Republic's treasury: one SQLite ledger for four funds.
//  - "budget": the monthly budget. Only entries from the current month count, so it
//    starts again from zero on the 1st of every month (in FUNDING_TIMEZONE).
//  - "legal", "welfare", "infrastructure": running balances that never reset.
// Welfare money is shared between two pots: creators (developers, artists, writers and
// interns, 80% by default) and need-based help for queer people (20%). Money coming in
// is split by that percentage; money paid out is taken from the pot it was paid from.
// Every change is a ledger entry (donation, refund, credit, deduction, adjustment), so
// the history stays auditable; nothing is ever overwritten in place.

export type Fund = 'budget' | 'legal' | 'welfare' | 'infrastructure';
export type WelfarePot = 'creators' | 'community';
export type EntryKind = 'donation' | 'refund' | 'credit' | 'deduction' | 'adjustment';
export const FUNDS: Fund[] = ['budget', 'legal', 'welfare', 'infrastructure'];
/** Funds that keep a running balance (everything except the monthly budget). */
export const BALANCE_FUNDS: Fund[] = ['legal', 'welfare', 'infrastructure'];
export const WELFARE_POTS: WelfarePot[] = ['creators', 'community'];
export const isFund = (v: unknown): v is Fund => FUNDS.includes(v as Fund);
export const KINDS: EntryKind[] = ['donation', 'refund', 'credit', 'deduction', 'adjustment'];

export type LedgerEntry = {
  id: number;
  fund: Fund;
  /** Welfare only: the pot money was paid from. Null means it is split by percentage. */
  pot: WelfarePot | null;
  kind: EntryKind;
  /** Signed amount in the fund currency, in minor units (paise / cents). */
  amountMinor: number;
  originalAmount: number | null;
  originalCurrency: string | null;
  source: 'buymeacoffee' | 'github' | 'crypto' | 'admin';
  externalId: string | null;
  supporterName: string | null;
  note: string | null;
  month: string; // YYYY-MM in FUNDING_TIMEZONE
  createdAt: string; // ISO
};

export type Settings = {
  budgetGoal: number; // monthly, major units
  legalGoal: number; // major units, 0 = no target
  welfareGoal: number;
  infrastructureGoal: number;
  welfareCreatorsPct: number; // share of welfare money for creators; the rest is need-based help
  donationFund: Fund; // where Buy Me a Coffee and GitHub Sponsors money goes
};

export const CURRENCY = process.env.FUNDING_CURRENCY || 'INR';
export const TIMEZONE = process.env.FUNDING_TIMEZONE || 'Asia/Kolkata';

type Row = {
  id: number;
  fund: Fund;
  pot: WelfarePot | null;
  kind: EntryKind;
  amount_minor: number;
  original_amount: number | null;
  original_currency: string | null;
  source: 'buymeacoffee' | 'github' | 'crypto' | 'admin';
  external_id: string | null;
  supporter_name: string | null;
  note: string | null;
  month: string;
  created_at: string;
};

const toEntry = (r: Row): LedgerEntry => ({
  id: r.id,
  fund: r.fund,
  pot: r.pot,
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
    welfareGoal: Number(s.welfareGoal ?? 0) || 0,
    infrastructureGoal: Number(s.infrastructureGoal ?? 0) || 0,
    welfareCreatorsPct: s.welfareCreatorsPct === undefined ? 80 : Math.max(0, Math.min(100, Number(s.welfareCreatorsPct) || 0)),
    donationFund: isFund(s.donationFund) ? s.donationFund : 'budget',
  };
}

export function updateSettings(patch: Partial<Settings>) {
  const put = db().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db().transaction(() => {
    if (patch.budgetGoal !== undefined) put.run('budgetGoal', String(Math.max(0, patch.budgetGoal)));
    if (patch.legalGoal !== undefined) put.run('legalGoal', String(Math.max(0, patch.legalGoal)));
    if (patch.welfareGoal !== undefined) put.run('welfareGoal', String(Math.max(0, patch.welfareGoal)));
    if (patch.infrastructureGoal !== undefined) put.run('infrastructureGoal', String(Math.max(0, patch.infrastructureGoal)));
    if (patch.welfareCreatorsPct !== undefined) put.run('welfareCreatorsPct', String(Math.max(0, Math.min(100, Math.round(patch.welfareCreatorsPct)))));
    if (patch.donationFund !== undefined) put.run('donationFund', patch.donationFund);
  });
  tx();
  return getSettings();
}

// ---------- ledger ----------

export type NewEntry = {
  fund: Fund;
  pot?: WelfarePot | null;
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
      `INSERT INTO ledger (fund, pot, kind, amount_minor, original_amount, original_currency, source, external_id, supporter_name, note, month, created_at)
       VALUES (@fund, @pot, @kind, @amountMinor, @originalAmount, @originalCurrency, @source, @externalId, @supporterName, @note, @month, @createdAt)
       ON CONFLICT(external_id) DO NOTHING`,
    )
    .run({
      fund: e.fund,
      pot: e.fund === 'welfare' ? (e.pot ?? null) : null,
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

export type PublicExpense = {
  id: number;
  fund: Fund;
  pot: WelfarePot | null;
  kind: 'deduction' | 'refund';
  /** Money that left the fund, as a positive number in minor units. */
  spentMinor: number;
  note: string | null;
  month: string;
  createdAt: string;
};

/**
 * Money that went out of the treasury, for the public ledger page: spending (deductions) and refunds.
 * Supporter names, sources and external ids are never included, and incoming money is not listed.
 */
export function listPublicExpenses(limit = 2000): PublicExpense[] {
  const rows = db()
    .prepare("SELECT * FROM ledger WHERE kind IN ('deduction', 'refund') AND amount_minor < 0 ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(Math.min(limit, 5000)) as Row[];
  return rows.map((r) => ({
    id: r.id,
    fund: r.fund,
    pot: r.pot,
    kind: r.kind as 'deduction' | 'refund',
    spentMinor: -r.amount_minor,
    note: r.note,
    month: r.month,
    createdAt: r.created_at,
  }));
}

const sum = (sql: string, ...args: unknown[]) => (db().prepare(sql).get(...args) as { total: number | null }).total ?? 0;

/** Running balance of a fund, in minor units. */
export const balanceMinor = (fund: Fund) => sum('SELECT SUM(amount_minor) total FROM ledger WHERE fund = ?', fund);
export const legalBalanceMinor = () => balanceMinor('legal');

/** The welfare balance split into its two pots, in minor units. */
export function welfareSplitMinor(creatorsPct = getSettings().welfareCreatorsPct) {
  const shared = sum("SELECT SUM(amount_minor) total FROM ledger WHERE fund = 'welfare' AND pot IS NULL");
  const fromPot = (pot: WelfarePot) => sum("SELECT SUM(amount_minor) total FROM ledger WHERE fund = 'welfare' AND pot = ?", pot);
  const creatorsShare = Math.round((shared * creatorsPct) / 100);
  return { creators: creatorsShare + fromPot('creators'), community: shared - creatorsShare + fromPot('community') };
}

/** What the monthly budget has raised (net of refunds and deductions) in a month, in minor units. */
export const budgetForMonthMinor = (month = monthOf()) => sum("SELECT SUM(amount_minor) total FROM ledger WHERE fund = 'budget' AND month = ?", month);

/** Sets a running fund to an exact balance by recording an adjustment for the difference. */
export function setBalance(fund: Fund, targetMinor: number, note?: string) {
  const diff = targetMinor - balanceMinor(fund);
  if (diff === 0) return null;
  return addEntry({ fund, kind: 'adjustment', amountMinor: diff, source: 'admin', note: note || 'Balance set by admin' });
}
export const setLegalBalance = (targetMinor: number, note?: string) => setBalance('legal', targetMinor, note);

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
  welfare: { balance: number; goal: number; creators: number; community: number; creatorsPct: number };
  infrastructure: { balance: number; goal: number };
  donationFund: Fund;
};

/** Public numbers for the funding page and GET /api/funds (major units). */
export function getSummary(): FundsSummary {
  const settings = getSettings();
  const month = monthOf();
  const split = welfareSplitMinor(settings.welfareCreatorsPct);
  return {
    currency: CURRENCY,
    month,
    monthLabel: monthLabel(month),
    budget: { raised: toMajor(budgetForMonthMinor(month)), goal: settings.budgetGoal },
    legal: { balance: toMajor(legalBalanceMinor()), goal: settings.legalGoal },
    welfare: {
      balance: toMajor(balanceMinor('welfare')),
      goal: settings.welfareGoal,
      creators: toMajor(split.creators),
      community: toMajor(split.community),
      creatorsPct: settings.welfareCreatorsPct,
    },
    infrastructure: { balance: toMajor(balanceMinor('infrastructure')), goal: settings.infrastructureGoal },
    donationFund: settings.donationFund,
  };
}
