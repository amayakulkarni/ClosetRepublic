import { NextResponse } from 'next/server';
import { adminRoute, amountFrom, readJson } from '@/lib/admin-api';
import { legalBalanceMinor, setLegalBalance, toMajor, toMinor } from '@/lib/funds';

export const dynamic = 'force-dynamic';

/** GET /api/admin/legal-balance */
export const GET = adminRoute(() => NextResponse.json({ balance: toMajor(legalBalanceMinor()) }));

/** PUT /api/admin/legal-balance  { balance, note? }  records an adjustment so the fund equals `balance`. */
export const PUT = adminRoute(async (request: Request) => {
  const body = await readJson(request);
  const entry = setLegalBalance(toMinor(amountFrom(body.balance, 'balance')), typeof body.note === 'string' ? body.note : undefined);
  return NextResponse.json({ balance: toMajor(legalBalanceMinor()), entry });
});
