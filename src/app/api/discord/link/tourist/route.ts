import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Retired: the Tourist role now comes from an intro sent to Snitch by DM. This folder can be deleted. */
export function POST() {
  return NextResponse.json({ error: 'The Tourist role is given after an intro check. Send Snitch your intro in a Discord DM.' }, { status: 410 });
}
