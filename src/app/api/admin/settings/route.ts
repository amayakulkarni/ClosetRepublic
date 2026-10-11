import { NextResponse } from 'next/server';
import { adminRoute, amountFrom, BadRequest, readJson } from '@/lib/admin-api';
import { budgetHistory, getSettings, getSummary, toMajor, updateSettings, type Fund } from '@/lib/funds';

export const dynamic = 'force-dynamic';

/** GET /api/admin/settings  settings, current totals and the last 12 months of the budget. */
export const GET = adminRoute(() =>
  NextResponse.json({
    settings: getSettings(),
    summary: getSummary(),
    history: budgetHistory().map((h) => ({ month: h.month, total: toMajor(h.total) })),
  }),
);

/** PUT /api/admin/settings  { budgetGoal?, legalGoal?, donationFund?: budget|legal } */
export const PUT = adminRoute(async (request: Request) => {
  const body = await readJson(request);
  const patch: { budgetGoal?: number; legalGoal?: number; donationFund?: Fund } = {};
  if (body.budgetGoal !== undefined) patch.budgetGoal = amountFrom(body.budgetGoal, 'budgetGoal');
  if (body.legalGoal !== undefined) patch.legalGoal = amountFrom(body.legalGoal, 'legalGoal');
  if (body.donationFund !== undefined) {
    if (body.donationFund !== 'budget' && body.donationFund !== 'legal') throw new BadRequest('donationFund must be budget or legal');
    patch.donationFund = body.donationFund;
  }
  return NextResponse.json({ settings: updateSettings(patch) });
});
