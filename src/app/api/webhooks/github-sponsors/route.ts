import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/admin-auth';
import { applySponsorshipEvent, type SponsorshipEvent } from '@/lib/github-sponsors';

// GitHub Sponsors webhook: github.com/sponsors/<account>/dashboard → Webhooks → Add webhook
//   Payload URL: https://<site>/api/webhooks/github-sponsors
//   Content type: application/json, Secret: the value of GITHUB_SPONSORS_WEBHOOK_SECRET
// GitHub signs each delivery with an HMAC-SHA256 of the raw body in X-Hub-Signature-256.

export const dynamic = 'force-dynamic';

const SECRET = process.env.GITHUB_SPONSORS_WEBHOOK_SECRET || '';

export async function POST(request: Request) {
  if (!SECRET) return NextResponse.json({ error: 'GITHUB_SPONSORS_WEBHOOK_SECRET is not set' }, { status: 503 });

  const raw = await request.text();
  const given = (request.headers.get('x-hub-signature-256') || '').trim().toLowerCase();
  const expected = `sha256=${crypto.createHmac('sha256', SECRET).update(raw).digest('hex')}`;
  if (!given || !safeEqual(given, expected)) return NextResponse.json({ error: 'Bad signature' }, { status: 401 });

  const event = request.headers.get('x-github-event') || '';
  if (event === 'ping') return NextResponse.json({ ok: true, pong: true });
  if (event !== 'sponsorship') return NextResponse.json({ ignored: event || 'unknown event' });

  let body: SponsorshipEvent;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Body is not JSON' }, { status: 400 });
  }
  return NextResponse.json({ result: applySponsorshipEvent(body) });
}
