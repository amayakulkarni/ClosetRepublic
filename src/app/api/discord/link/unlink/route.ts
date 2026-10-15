import { NextResponse, after } from 'next/server';
import { discordSession, unlink } from '@/lib/discord-link';
import { pokeBot } from '@/lib/memberships';

export const dynamic = 'force-dynamic';

/** POST  removes the email link for the signed-in Discord account. */
export async function POST() {
  const session = await discordSession();
  if (!session) return NextResponse.json({ error: 'Your Discord sign-in expired. Continue with Discord again.' }, { status: 401 });
  const removed = unlink(session.id);
  after(() => pokeBot({ discordId: session.id }));
  return NextResponse.json({ ok: true, removed });
}
