import { NextResponse, after } from 'next/server';
import { fulfilInvoice, validSignature } from '@/lib/btcpay';
import { pokeBot } from '@/lib/memberships';

// BTCPay Server webhook: Store > Settings > Webhooks > Create, Payload URL
//   https://<site>/api/webhooks/btcpay
// with the events "An invoice has been settled" and "A payment has been settled", and the
// secret copied into BTCPAY_WEBHOOK_SECRET. Requests carry BTCPay-Sig: sha256=<HMAC-SHA256 of the body>.
// The invoice is re-read from BTCPay before anything is granted, so a forged or replayed event
// changes nothing.

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get('btcpay-sig'))) return NextResponse.json({ error: 'Bad signature' }, { status: 401 });
  let event: { type?: string; invoiceId?: string };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }
  if (!event.invoiceId || !/^(InvoiceSettled|InvoicePaymentSettled)$/.test(event.type || '')) return NextResponse.json({ ignored: event.type || 'unknown event' });
  try {
    const r = await fulfilInvoice(event.invoiceId);
    if (r.result === 'granted' && r.discordId) after(() => pokeBot({ discordId: r.discordId }));
    if (r.result === 'no-order') console.warn('[btcpay] settled invoice without a matching order:', event.invoiceId);
    return NextResponse.json({ result: r.result });
  } catch (err) {
    console.warn('[btcpay] webhook failed:', (err as Error).message);
    // A 5xx makes BTCPay retry the delivery.
    return NextResponse.json({ error: 'Could not check the invoice' }, { status: 502 });
  }
}
