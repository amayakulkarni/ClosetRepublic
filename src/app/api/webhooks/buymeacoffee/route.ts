import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/admin-auth';
import { CURRENCY, addEntry, getSettings, toMinor } from '@/lib/funds';
import { rateFor } from '@/lib/exchange';

// Buy Me a Coffee webhook: Buy Me a Coffee → Settings → Webhooks → add
//   https://<your site>/api/webhooks/buymeacoffee
// and copy its secret into BMC_WEBHOOK_SECRET. Every request is signed with an
// HMAC-SHA256 of the raw body in the x-signature-sha256 header.
//
// Payments (donations, memberships, extras…) are added to the fund chosen in the admin
// page; refunds take the money back out. Retries of the same event are ignored.

export const dynamic = 'force-dynamic';

const SECRET = process.env.BMC_WEBHOOK_SECRET || '';
const ACCEPT_TEST_EVENTS = process.env.BMC_ACCEPT_TEST_EVENTS === 'true';

type BmcEvent = {
  type?: string;
  live_mode?: boolean;
  event_id?: number | string;
  created?: number;
  data?: {
    id?: number | string;
    amount?: number | string;
    total_amount_charged?: number | string;
    currency?: string;
    supporter_name?: string;
    support_note?: string;
    note_hidden?: string | boolean;
    created_at?: number;
    refunded_at?: number | null;
  };
};

export async function POST(request: Request) {
  if (!SECRET) return NextResponse.json({ error: 'BMC_WEBHOOK_SECRET is not set' }, { status: 503 });

  const raw = await request.text();
  const given = (request.headers.get('x-signature-sha256') || '').trim().toLowerCase();
  const expected = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  if (!given || !safeEqual(given, expected)) return NextResponse.json({ error: 'Bad signature' }, { status: 401 });

  let event: BmcEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Body is not JSON' }, { status: 400 });
  }

  const type = event.type || '';
  const data = event.data || {};
  if (event.live_mode === false && !ACCEPT_TEST_EVENTS) return NextResponse.json({ ignored: 'test event' });

  const isRefund = /refund/i.test(type);
  const isPayment = !isRefund && /\.(created|started|renewed)$/.test(type);
  const amount = Number(data.amount ?? data.total_amount_charged);
  if ((!isRefund && !isPayment) || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ignored: type || 'unknown event' });
  }

  const currency = (data.currency || CURRENCY).toUpperCase();
  const rate = rateFor(currency);
  const converted = amount * (rate ?? 1);
  const when = data.refunded_at || data.created_at || event.created;
  const hidden = data.note_hidden === true || data.note_hidden === 'true';

  const entry = addEntry({
    fund: getSettings().donationFund,
    kind: isRefund ? 'refund' : 'donation',
    amountMinor: toMinor(isRefund ? -converted : converted),
    source: 'buymeacoffee',
    externalId: `bmc:${isRefund ? 'refund' : 'payment'}:${type.split('.')[0]}:${data.id ?? event.event_id}`,
    originalAmount: amount,
    originalCurrency: currency,
    supporterName: data.supporter_name || null,
    note: [
      type,
      rate === null ? `not converted: add ${currency} to EXCHANGE_RATES` : null,
      !hidden && data.support_note ? data.support_note.slice(0, 300) : null,
    ]
      .filter(Boolean)
      .join(' · '),
    createdAt: when ? new Date(Number(when) * 1000) : undefined,
  });

  return NextResponse.json({ recorded: Boolean(entry), duplicate: !entry });
}
