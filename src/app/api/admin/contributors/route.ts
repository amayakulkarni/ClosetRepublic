import { NextResponse } from 'next/server';
import { adminRoute, BadRequest } from '@/lib/admin-api';
import { CONTRIBUTION_AREAS, CONTRIBUTOR_STATUSES, type ContributionArea, type ContributorStatus } from '@/lib/contribution-areas';
import { listContributors, newCounts } from '@/lib/contributors';
import { lastEmails, mailConfigured } from '@/lib/mail';

export const dynamic = 'force-dynamic';

/** GET /api/admin/contributors?area=art&status=new */
export const GET = adminRoute((request: Request) => {
  const q = new URL(request.url).searchParams;
  const area = q.get('area') || undefined;
  const status = q.get('status') || undefined;
  if (area && !CONTRIBUTION_AREAS.includes(area as ContributionArea)) throw new BadRequest('area must be constitution, writing or art');
  if (status && !CONTRIBUTOR_STATUSES.includes(status as ContributorStatus)) throw new BadRequest('status must be new, verifying, verified or declined');
  const last = lastEmails();
  return NextResponse.json({
    contributors: listContributors({ area: area as ContributionArea | undefined, status: status as ContributorStatus | undefined }).map((c) => ({
      ...c,
      lastEmail: last.get(c.id) ?? null,
    })),
    newCounts: newCounts(),
    mailEnabled: mailConfigured(),
  });
});
