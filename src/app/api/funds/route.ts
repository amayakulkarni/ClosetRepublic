import { NextResponse } from 'next/server';
import { getSummary } from '@/lib/funds';

export const dynamic = 'force-dynamic';

/** Public: this month's budget and the legal fund balance. */
export function GET() {
  return NextResponse.json(getSummary(), { headers: { 'Cache-Control': 'no-store' } });
}
