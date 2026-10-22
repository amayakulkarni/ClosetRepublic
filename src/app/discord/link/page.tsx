import type { Metadata } from 'next';
import { getNature } from '@/lib/nature';
import { Art } from '@/components/Art';
import { Notice } from '@/components/Notice';
import { DiscordGuide } from '@/components/discord/DiscordGuide';
import { DiscordLinkForm } from '@/components/discord/DiscordLinkForm';
import { CryptoPay } from '@/components/discord/CryptoPay';
import { CRYPTO_MONTHS, CRYPTO_TIERS, btcpayConfigured } from '@/lib/btcpay';
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

export default async function DiscordLinkPage({ searchParams }: { searchParams: Promise<{ error?: string; paid?: string; guide?: string }> }) {
  const { on } = await getNature();
  const { error, paid, guide } = await searchParams;
  // ?guide=true opens the beginner guide, ?guide=false hides it, and without the option it is folded away.
  const guideMode = guide === 'true' ? 'open' : guide === 'false' ? 'hidden' : 'folded';
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

      {guideMode === 'open' && <DiscordGuide open />}

      {error && ERRORS[error] && <Notice tone="warn">{ERRORS[error]}</Notice>}
      {paid && <Notice>Thank you. Once the payment is confirmed on the blockchain, your class appears in Discord. Monero takes about 20 minutes and Bitcoin 10 to 60 minutes; Lightning is instant. Reload this page to check.</Notice>}

      <section className="section discord-link" aria-labelledby="steps-heading">
        <h2 id="steps-heading">{on ? 'Your application' : 'Link your accounts'}</h2>
        {!linkingConfigured() ? (
          <Notice>Discord linking is not switched on yet. Please check back soon.</Notice>
        ) : !session ? (
          <>
            <ol className="steps-list">
              <li>Step one: sign in with Discord, so we know which account gets the role. We only see your Discord ID and name.</li>
              <li>Step two: type the email you use on Buy Me a Coffee (or will use for crypto). We email you a 6-digit code; typing it proves the email is yours.</li>
              <li>Your class appears in Discord within a minute. Alien is the $1 entry class, per month or per year.</li>
            </ol>
            <p>
              <a className="button" href="/discord/login">
                Continue with Discord
              </a>
            </p>
            <p className="hint">
              The button opens Discord&rsquo;s own sign-in page on discord.com. Closet Republic never asks for a Discord password.
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

      {btcpayConfigured() && (
        <section className="section discord-link" id="crypto" aria-labelledby="crypto-heading">
          <h2 id="crypto-heading">{on ? 'Pay in crypto' : 'Pay with crypto'}</h2>
          {session ? (
            <div className="discord-link__card">
              <p>Prepay a class with Monero, Bitcoin or Lightning. It goes to the Discord account you are signed in with (<strong>{session.name}</strong>), with no Buy Me a Coffee membership needed.</p>
              <CryptoPay tiers={[...CRYPTO_TIERS]} months={[...CRYPTO_MONTHS]} />
            </div>
          ) : (
            <p>
              <a href="/discord/login">Continue with Discord</a> first, so the class goes to the right account. Then choose a class and pay with Monero, Bitcoin or Lightning.
            </p>
          )}
        </section>
      )}

      {guideMode === 'folded' && <DiscordGuide open={false} />}

      <section className="section" aria-labelledby="faq-heading">
        <h2 id="faq-heading">Good to know</h2>
        <ul className="plain-list">
          <li>Not a member yet? Choose a class on {donateUrl ? <a href={donateUrl}>Buy Me a Coffee</a> : 'Buy Me a Coffee'}, then come back here.</li>
          <li>Your class comes from your membership. Paying never buys votes in Parliament or moderator powers.</li>
          <li>Members verified for 90 days or more become Elders automatically. Elders can enter the Elder rooms and start private voice rooms.</li>
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
