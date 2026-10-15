import { NextResponse, after } from 'next/server';
import { discordSession, link, linkStatus, verifyCode } from '@/lib/discord-link';
import { pokeBot } from '@/lib/memberships';

export const dynamic = 'force-dynamic';

/** POST { code }  links the email once the right code is typed, then wakes the bot. */
export async function POST(request: Request) {
  const session = await discordSession();
  if (!session) return NextResponse.json({ error: 'Your Discord sign-in expired. Continue with Discord again.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const result = verifyCode(session.id, String(body.code || ''));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { replaced } = link(session.id, result.email);
  after(async () => {
    await pokeBot({ discordId: session.id });
    if (replaced) await pokeBot({ discordId: replaced });
  });
  const status = linkStatus(session.id);
  return NextResponse.json({ ok: true, hasMembership: Boolean(status.membership) });
}
