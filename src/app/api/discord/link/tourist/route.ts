import { NextResponse, after } from 'next/server';
import { becomeTourist, discordSession, touristEnabled } from '@/lib/discord-link';
import { pokeBot } from '@/lib/memberships';

export const dynamic = 'force-dynamic';

/** POST  gives the signed-in, email-verified Discord account the free Tourist role, then wakes the bot. */
export async function POST() {
  const session = await discordSession();
  if (!session) return NextResponse.json({ error: 'Your Discord sign-in expired. Continue with Discord again.' }, { status: 401 });
  if (!touristEnabled()) return NextResponse.json({ error: 'The Tourist role is not switched on yet.' }, { status: 404 });
  if (!becomeTourist(session.id)) return NextResponse.json({ error: 'Verify your email first, then join as a Tourist.' }, { status: 400 });
  after(() => pokeBot({ discordId: session.id }));
  return NextResponse.json({ ok: true });
}
