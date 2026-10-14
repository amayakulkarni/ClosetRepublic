import { after, NextResponse } from 'next/server';
import { BadRequest, readJson, textFrom } from '@/lib/admin-api';
import { sendWelcome, subscribe } from '@/lib/lifeline';
import { tooMany } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/lifeline  { email, name?, agree: true }  joins the Lifeline list. */
export async function POST(request: Request) {
  if (tooMany('lifeline', request)) return NextResponse.json({ error: 'Too many sign-ups from here. Please try again in an hour.' }, { status: 429 });
  try {
    const body = await readJson(request);
    if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true }, { status: 201 });
    const email = textFrom(body.email, 'Email', { required: true, max: 200 })!;
    if (!EMAIL.test(email)) throw new BadRequest('That email address does not look right');
    const name = textFrom(body.name, 'Name', { max: 100 });
    if (body.agree !== true) throw new BadRequest('Please tick the box to agree to the Lifeline emails');
    const { subscriber, isNew } = subscribe(email, name);
    if (isNew) after(() => sendWelcome(subscriber));
    // Same answer either way, so the form never reveals who is already on the list.
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
