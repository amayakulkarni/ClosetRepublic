import { after, NextResponse } from 'next/server';
import { BadRequest, readJson, textFrom } from '@/lib/admin-api';
import { CONTRIBUTION_AREAS, type ContributionArea } from '@/lib/contribution-areas';
import { addContributor } from '@/lib/contributors';
import { sendSignupEmails } from '@/lib/contributor-mail';
import { tooMany } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST /api/contribute  { area, name, pronouns?, email, portfolioUrl, agree: true }
// Public sign-up for constitution, writing and art contributors. Only contact details and a
// public link are accepted: there are no file or free-text fields, by design.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicLink(value: unknown) {
  const s = textFrom(value, 'Portfolio link', { required: true, max: 500 })!;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if ((u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.')) return u.toString();
  } catch {}
  throw new BadRequest('Portfolio link must be a public web address, like a Reddit post or an Instagram page');
}

export async function POST(request: Request) {
  if (tooMany('contribute', request)) return NextResponse.json({ error: 'Too many sign-ups from here. Please try again in an hour.' }, { status: 429 });

  try {
    const body = await readJson(request);
    // Honeypot: a hidden field people never see. Pretend it worked so bots move on.
    if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true }, { status: 201 });

    const area = String(body.area || '') as ContributionArea;
    if (!CONTRIBUTION_AREAS.includes(area)) throw new BadRequest('Choose constitution, writing or art');
    const name = textFrom(body.name, 'Name', { required: true, max: 100 })!;
    const pronouns = textFrom(body.pronouns, 'Pronouns', { max: 40 });
    const email = textFrom(body.email, 'Email', { required: true, max: 200 })!;
    if (!EMAIL.test(email)) throw new BadRequest('That email address does not look right');
    const portfolioUrl = publicLink(body.portfolioUrl);
    if (body.agree !== true) throw new BadRequest('Please confirm you have read the notes above the form');

    const { contributor, duplicate } = addContributor({ area, name, pronouns, email, portfolioUrl });
    // Emails go out after the response, so a slow mail server never holds up the form.
    if (!duplicate) after(() => sendSignupEmails(contributor));
    return NextResponse.json({ ok: true, duplicate }, { status: duplicate ? 200 : 201 });
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
