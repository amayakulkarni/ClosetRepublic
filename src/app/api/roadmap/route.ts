import { NextResponse } from 'next/server';
import { listEvents, listGoals } from '@/lib/roadmap';

export const dynamic = 'force-dynamic';

/** GET /api/roadmap  the public timeline and goals. */
export function GET() {
  return NextResponse.json({ timeline: listEvents(), goals: listGoals() });
}
