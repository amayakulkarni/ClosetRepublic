import { NextResponse } from 'next/server';
import { getSummary } from '@/lib/funds';
import { recordSponsorRenewals } from '@/lib/github-sponsors';

export const dynamic = 'force-dynamic';

/** Public: this month's budget and the legal fund balance. */
export function GET() {
  recordSponsorRenewals();
  return NextResponse.json(getSummary(), { headers: { 'Cache-Control': 'no-store' } });
}
