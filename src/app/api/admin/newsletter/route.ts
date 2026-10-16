import { NextResponse } from 'next/server';
import { adminRoute } from '@/lib/admin-api';
import { mailgunConfigured } from '@/lib/mailgun';
import { listIssues, subscriberCounts } from '@/lib/newsletter';

export const dynamic = 'force-dynamic';

/** GET /api/admin/newsletter  counts, past issues and whether Mailgun is set up. */
export const GET = adminRoute(() =>
  NextResponse.json({
    counts: subscriberCounts(),
    issues: listIssues(),
    mailgun: mailgunConfigured(),
    testTo: process.env.ADMIN_2FA_EMAIL || process.env.CONTRIBUTIONS_EMAIL || '',
  }),
);
