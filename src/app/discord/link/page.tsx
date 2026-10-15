import type { Metadata } from 'next';
import { getNature } from '@/lib/nature';
import { Art } from '@/components/Art';
import { Notice } from '@/components/Notice';
import { DiscordLinkForm } from '@/components/discord/DiscordLinkForm';
import { discordSession, linkStatus, linkingConfigured, maskEmail } from '@/lib/discord-link';

export const metadata: Metadata = {
  title: 'Link your Discord',
  description: 'Connect your Buy Me a Coffee membership to your Discord account to get your class role and lounges.',
};
export const dynamic = 'force-dynamic';

const TIER_NAME: Record<string, string> = {
  alien: 'Alien',
  citizen: 'Citizen',
  'top-1': 'Top 1%',
  'upper-middle-class': 'Upper Middle Class',
  'middle-class': 'Middle Class',
};

const ERRORS: Record<string, string> = {
  setup: 'Discord linking is not set up on this site yet (DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET).',
  cancelled: 'Discord sign-in was cancelled. Nothing was linked.',
  expired: 'That sign-in took too long. Please try again.',
  discord: 'Discord did not let us sign you in. Please try again in a moment.',
};

export default async function DiscordLinkPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { on } = await getNature();
  const { error } = await searchParams;
  const session = await discordSession();
  const status = session ? linkStatus(session.id) : null;
  const donateUrl = process.env.NEXT_PUBLIC_DONATE_URL || '';

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{on ? 'Immigration Office' : 'Link your Discord'}</h1>
          <p className="lede">
            {on
              ? 'Present your Buy Me a Coffee papers and receive your class in the Republic’s Discord. The office keeps only your Discord number and the email on your papers.'
              : 'Connect the email you use on Buy Me a Coffee to your Discord account, and your class role and lounges appear in our Discord server.'}
          </p>
        </div>
        <Art name="looking-ahead" nature={on} className="page-head__art" />
      </header>

      {error && ERRORS[error] && <Notice tone="warn">{ERRORS[error]}</Notice>}

      <section className="section discord-link" aria-labelledby="steps-heading">
        <h2 id="steps-heading">{on ? 'Your application' : 'Link your accounts'}</h2>
        {!linkingConfigured() ? (
          <Notice>Discord linking is not switched on yet. Please check back soon.</Notice>
        ) : !session ? (
          <>
            <ol className="steps-list">
              <li>Sign in with Discord, so we know which account gets the role. We only see your Discord ID and name.</li>
              <li>Type the email you use on Buy Me a Coffee. We email you a 6-digit code.</li>
              <li>Type the code. Your class appears in Discord within a minute.</li>
            </ol>
            <p>
              <a className="button" href="/discord/login">
                Continue with Discord
              </a>
            </p>
          </>
        ) : (
          <DiscordLinkForm
            name={session.name}
            linkedEmail={status?.email ? maskEmail(status.email) : null}
            membership={status?.membership ?? null}
            tierName={status?.appliedTier ? TIER_NAME[status.appliedTier] || status.appliedTier : null}
            tierState={status?.appliedState ?? null}
            donateUrl={donateUrl}
          />
        )}
      </section>

      <section className="section" aria-labelledby="faq-heading">
        <h2 id="faq-heading">Good to know</h2>
        <ul className="plain-list">
          <li>Not a member yet? Choose a class on {donateUrl ? <a href={donateUrl}>Buy Me a Coffee</a> : 'Buy Me a Coffee'}, then come back here.</li>
          <li>Your class comes from your membership. Paying never buys votes in Parliament or moderator powers.</li>
          <li>If your membership ends, you keep your class until the end of the period you paid for, then for a 7-day grace period.</li>
          <li>Prefer not to show your class? Type <code>/discreet on</code> in Discord: your colour is hidden and your lounges stay.</li>
          <li>
            Type <code>/forget-me</code> in Discord at any time to delete your link. See the <a href="/privacy">Privacy Policy</a>.
          </li>
        </ul>
      </section>
    </>
  );
}
