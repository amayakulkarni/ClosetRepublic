import { NextResponse } from 'next/server';
import { adminRoute, amountFrom, BadRequest, readJson } from '@/lib/admin-api';
import { budgetHistory, getSettings, getSummary, isFund, toMajor, updateSettings, type Settings } from '@/lib/funds';
import { recordSponsorRenewals, sponsorSummary } from '@/lib/github-sponsors';

export const dynamic = 'force-dynamic';

/** GET /api/admin/settings  settings, current totals and the last 12 months of the budget. */
export const GET = adminRoute(() => {
  recordSponsorRenewals();
  return NextResponse.json({
    settings: getSettings(),
    summary: getSummary(),
    githubSponsors: sponsorSummary(),
    history: budgetHistory().map((h) => ({ month: h.month, total: toMajor(h.total) })),
  });
});

/** PUT /api/admin/settings  { budgetGoal?, legalGoal?, welfareGoal?, infrastructureGoal?, welfareCreatorsPct?, donationFund? } */
export const PUT = adminRoute(async (request: Request) => {
  const body = await readJson(request);
  const patch: Partial<Settings> = {};
  for (const key of ['budgetGoal', 'legalGoal', 'welfareGoal', 'infrastructureGoal'] as const) {
    if (body[key] !== undefined) patch[key] = amountFrom(body[key], key);
  }
  if (body.welfareCreatorsPct !== undefined) {
    const pct = amountFrom(body.welfareCreatorsPct, 'welfareCreatorsPct');
    if (pct < 0 || pct > 100) throw new BadRequest('welfareCreatorsPct must be between 0 and 100');
    patch.welfareCreatorsPct = pct;
  }
  if (body.donationFund !== undefined) {
    if (!isFund(body.donationFund)) throw new BadRequest('donationFund must be budget, legal, welfare or infrastructure');
    patch.donationFund = body.donationFund;
  }
  return NextResponse.json({ settings: updateSettings(patch) });
});
