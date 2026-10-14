import { NextResponse } from 'next/server';
import { adminRoute } from '@/lib/admin-api';
import { GITHUB_URL } from '@/lib/community';
import { lastExportAt, listBroadcasts, listSubscribers, subscriberCounts } from '@/lib/lifeline';
import { mailConfigured } from '@/lib/mail';

export const dynamic = 'force-dynamic';

/** GET /api/admin/lifeline  subscribers, counts, past emergency notices and default links. */
export const GET = adminRoute(() =>
  NextResponse.json({
    counts: subscriberCounts(),
    subscribers: listSubscribers().map(({ token: _token, ...s }) => s),
    broadcasts: listBroadcasts(),
    mailEnabled: mailConfigured(),
    lastExportAt: lastExportAt(),
    defaults: { githubUrl: GITHUB_URL, donateUrl: process.env.NEXT_PUBLIC_DONATE_URL || '' },
  }),
);
