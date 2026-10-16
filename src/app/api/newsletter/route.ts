import { NextResponse } from 'next/server';
import { BadRequest, readJson, textFrom } from '@/lib/admin-api';
import { NewsletterError, newsletterEnabled, requestSignup } from '@/lib/newsletter';
import { tooMany } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/newsletter  { email }  asks Ghost to send the confirmation email for the newsletter. */
export async function POST(request: Request) {
  if (!newsletterEnabled()) return NextResponse.json({ error: 'The newsletter is not open yet.' }, { status: 503 });
  if (tooMany('newsletter', request)) return NextResponse.json({ error: 'Too many attempts from here. Please try again in an hour.' }, { status: 429 });
  try {
    const body = await readJson(request);
    // Bots fill the hidden field; pretend it worked.
    if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true }, { status: 201 });
    const email = textFrom(body.email, 'Email', { required: true, max: 200 })!;
    if (!EMAIL.test(email)) throw new BadRequest('That email address does not look right');
    await requestSignup(email);
    // Same answer whether or not the address is already subscribed.
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof NewsletterError) {
      console.warn('[newsletter] sign-up failed:', err.message);
      return NextResponse.json({ error: 'Could not sign you up right now. Please try again later.' }, { status: 502 });
    }
    throw err;
  }
}
