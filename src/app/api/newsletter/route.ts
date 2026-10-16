import { after, NextResponse } from 'next/server';
import { BadRequest, readJson, textFrom } from '@/lib/admin-api';
import { newsletterEnabled, sendConfirmation, startSignup } from '@/lib/newsletter';
import { tooMany } from '@/lib/rate-limit';
import { canSendMail } from '@/lib/transactional';

export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/newsletter  { email }  records the sign-up and emails a confirmation link (double opt-in). */
export async function POST(request: Request) {
  if (!newsletterEnabled() || !canSendMail()) return NextResponse.json({ error: 'The newsletter is not open yet.' }, { status: 503 });
  if (tooMany('newsletter', request)) return NextResponse.json({ error: 'Too many attempts from here. Please try again in an hour.' }, { status: 429 });
  try {
    const body = await readJson(request);
    // Bots fill the hidden field; pretend it worked.
    if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true }, { status: 201 });
    const email = textFrom(body.email, 'Email', { required: true, max: 200 })!.toLowerCase();
    if (!EMAIL.test(email)) throw new BadRequest('That email address does not look right');
    const pending = startSignup(email);
    if (pending) after(() => sendConfirmation(pending));
    // The same answer whether or not the address is already subscribed.
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
