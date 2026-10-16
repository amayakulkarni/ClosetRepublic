import { NextResponse } from 'next/server';
import { DONATION_MAX_USD, DONATION_MIN_USD, btcpayConfigured, createCryptoDonation } from '@/lib/btcpay';
import { tooMany } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** POST { amount }  creates a free-amount BTCPay donation invoice (USD, no sign-in, no personal details); returns { url }. */
export async function POST(request: Request) {
  if (!btcpayConfigured()) return NextResponse.json({ error: 'Crypto payments are not switched on yet.' }, { status: 503 });
  if (tooMany('crypto-donate', request, 10)) return NextResponse.json({ error: 'Too many attempts. Try again in an hour.' }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { amount?: unknown };
  const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount);
  if (!Number.isFinite(amount) || amount < DONATION_MIN_USD || amount > DONATION_MAX_USD) {
    return NextResponse.json({ error: `Enter an amount between $${DONATION_MIN_USD} and $${DONATION_MAX_USD.toLocaleString('en-US')}.` }, { status: 400 });
  }
  try {
    return NextResponse.json({ url: await createCryptoDonation(amount) });
  } catch (err) {
    console.warn('[btcpay] donation failed:', (err as Error).message);
    return NextResponse.json({ error: 'Could not start the payment. Try again later.' }, { status: 502 });
  }
}
