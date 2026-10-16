import { NextResponse } from 'next/server';
import { BadRequest, adminRoute, readJson, textFrom } from '@/lib/admin-api';
import { SendBlocked, postsBySlug, renderIssue, runIssue, sendTestIssue, startIssue, subscriberCounts } from '@/lib/newsletter';
import { after } from 'next/server';

export const dynamic = 'force-dynamic';

const slugs = (v: unknown, field: string) => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 30 || v.some((s) => typeof s !== 'string')) throw new BadRequest(`${field} must be a list of post slugs`);
  return v as string[];
};

/**
 * POST /api/admin/newsletter/compose
 *  { action: 'preview' | 'test' | 'send', subject, intro, featured: [slug], recommended: [slug], to?, expectedCount? }
 * Posts are looked up by slug in Ghost, so the page cannot inject its own content.
 */
export const POST = adminRoute(async (request: Request) => {
  const body = await readJson(request);
  const action = body.action;
  if (action !== 'preview' && action !== 'test' && action !== 'send') throw new BadRequest('Unknown action');
  const subject = textFrom(body.subject, 'Subject', { required: true, max: 150 })!;
  const intro = textFrom(body.intro, 'Introduction', { max: 4000 }) ?? '';
  const featuredSlugs = slugs(body.featured, 'featured');
  const recommendedSlugs = slugs(body.recommended, 'recommended');
  if (featuredSlugs.length + recommendedSlugs.length === 0 && !intro) throw new BadRequest('Pick at least one post or write an introduction');
  const [featured, recommended] = await Promise.all([postsBySlug(featuredSlugs), postsBySlug(recommendedSlugs)]);
  const { html, text } = renderIssue({ subject, intro, featured, recommended });

  if (action === 'preview') return NextResponse.json({ html, missing: featuredSlugs.length + recommendedSlugs.length - featured.length - recommended.length });

  if (action === 'test') {
    const to = textFrom(body.to, 'Test address', { required: true, max: 200 })!;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new BadRequest('That test address does not look right');
    const r = await sendTestIssue(to, subject, html, text);
    if (!r.ok) return NextResponse.json({ error: r.error || 'The test email failed' }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  try {
    const expected = Number(body.expectedCount);
    const issue = startIssue(subject, html, text, Number.isFinite(expected) ? expected : -1);
    after(() => runIssue(issue, subject, html));
    return NextResponse.json({ ok: true, id: issue.id, total: issue.recipients.length, counts: subscriberCounts() }, { status: 202 });
  } catch (err) {
    if (err instanceof SendBlocked) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
});
