import { NextResponse } from 'next/server';
import { adminRoute, amountFrom, BadRequest, readJson } from '@/lib/admin-api';
import { BALANCE_FUNDS, balanceMinor, setBalance, toMajor, toMinor, type Fund } from '@/lib/funds';

export const dynamic = 'force-dynamic';

/** PUT /api/admin/balance  { fund: legal|welfare|infrastructure, balance, note? }  records an adjustment so the fund equals `balance`. */
export const PUT = adminRoute(async (request: Request) => {
  const body = await readJson(request);
  const fund = body.fund as Fund;
  if (!BALANCE_FUNDS.includes(fund)) throw new BadRequest('fund must be legal, welfare or infrastructure');
  const entry = setBalance(fund, toMinor(amountFrom(body.balance, 'balance')), typeof body.note === 'string' ? body.note : undefined);
  return NextResponse.json({ balance: toMajor(balanceMinor(fund)), entry });
});
