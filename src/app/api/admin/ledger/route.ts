import { NextResponse } from 'next/server';
import { adminRoute, amountFrom, BadRequest, readJson } from '@/lib/admin-api';
import { FUNDS, addEntry, listEntries, toMinor, type EntryKind, type Fund } from '@/lib/funds';

export const dynamic = 'force-dynamic';

/** GET /api/admin/ledger?fund=legal&month=2026-10&limit=100 */
export const GET = adminRoute((request: Request) => {
  const q = new URL(request.url).searchParams;
  const fund = q.get('fund');
  if (fund && !FUNDS.includes(fund as Fund)) throw new BadRequest('fund must be budget or legal');
  const month = q.get('month') || undefined;
  if (month && !/^\d{4}-\d{2}$/.test(month)) throw new BadRequest('month must look like 2026-10');
  return NextResponse.json({ entries: listEntries({ fund: (fund as Fund) || undefined, month, limit: Number(q.get('limit')) || 200 }) });
});

// Kinds an admin can add by hand. Credits add money, deductions remove it,
// adjustments are signed corrections.
const MANUAL: Record<string, 1 | -1 | 0> = { credit: 1, deduction: -1, adjustment: 0 };

/** POST /api/admin/ledger  { fund, kind: credit|deduction|adjustment, amount, note } */
export const POST = adminRoute(async (request: Request) => {
  const body = await readJson(request);
  const fund = body.fund as Fund;
  if (!FUNDS.includes(fund)) throw new BadRequest('fund must be budget or legal');
  const kind = String(body.kind || '');
  if (!(kind in MANUAL)) throw new BadRequest('kind must be credit, deduction or adjustment');
  const amount = amountFrom(body.amount);
  if (MANUAL[kind] !== 0 && amount <= 0) throw new BadRequest('amount must be positive for credits and deductions');
  const signed = MANUAL[kind] === 0 ? amount : MANUAL[kind] * amount;
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
  const entry = addEntry({ fund, kind: kind as EntryKind, amountMinor: toMinor(signed), source: 'admin', note });
  return NextResponse.json({ entry }, { status: 201 });
});
