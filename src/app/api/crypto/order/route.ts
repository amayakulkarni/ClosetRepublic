import { NextResponse } from 'next/server';
import { CRYPTO_MONTHS, CRYPTO_TIERS, btcpayConfigured, createCryptoOrder } from '@/lib/btcpay';
import { discordSession } from '@/lib/discord-link';
import { tooMany } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** POST { tier, months }  creates a BTCPay invoice for the signed-in Discord account; returns { url }. */
export async function POST(request: Request) {
  if (!btcpayConfigured()) return NextResponse.json({ error: 'Crypto payments are not switched on yet.' }, { status: 503 });
  const session = await discordSession();
  if (!session) return NextResponse.json({ error: 'Your Discord sign-in expired. Continue with Discord again.' }, { status: 401 });
  if (tooMany('crypto-order', request, 10)) return NextResponse.json({ error: 'Too many attempts. Try again in an hour.' }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { tier?: unknown; months?: unknown };
  if (!CRYPTO_TIERS.some((t) => t.slug === body.tier) || !(CRYPTO_MONTHS as readonly number[]).includes(Number(body.months))) {
    return NextResponse.json({ error: 'Choose a class and a length.' }, { status: 400 });
  }
  try {
    const url = await createCryptoOrder(session.id, String(body.tier), Number(body.months));
    return NextResponse.json({ url });
  } catch (err) {
    console.warn('[btcpay] order failed:', (err as Error).message);
    return NextResponse.json({ error: 'Could not start the payment. Try again later.' }, { status: 502 });
  }
}
