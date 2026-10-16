import type { Metadata } from 'next';
import Link from 'next/link';
import { getNature } from '@/lib/nature';
import { getAuthors, getEntry, getNatureEdition, safely } from '@/lib/ghost';
import { Art } from '@/components/Art';
import { AuthorCard } from '@/components/AuthorCard';
import { GhostContent } from '@/components/GhostContent';
import { Notice } from '@/components/Notice';
import { FundWidget } from '@/components/FundWidget';
import { CURRENCY, getSummary } from '@/lib/funds';
import { recordSponsorRenewals, sponsorSummary } from '@/lib/github-sponsors';
import { DONATION_MAX_USD, DONATION_MIN_USD, btcpayConfigured } from '@/lib/btcpay';
import { CryptoDonate } from '@/components/CryptoDonate';
import { COMMUNITY_APPEAL, DONATE_LABEL, DONATE_URL, MEMBERSHIP_URL, SPONSORS_URL, UPI_ID, upiLink } from '@/lib/donate';
import { newsletterSettings } from '@/lib/newsletter';

export const metadata: Metadata = { title: 'Ministry of Finance' };
export const dynamic = 'force-dynamic';

// Donations go through Buy Me a Coffee and GitHub Sponsors (their webhooks keep the treasury
// up to date), plus an optional UPI ID. The channels are read in src/lib/donate.ts.

const money = (n: number) =>
  new Intl.NumberFormat(CURRENCY === 'INR' ? 'en-IN' : 'en', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(n);

export default async function FundingPage({ searchParams }: { searchParams: Promise<{ thanks?: string }> }) {
  const { on } = await getNature();
  const thanks = (await searchParams).thanks === 'crypto';
  const { data, problem } = await safely(
    async () => {
      const [budget, natureBudget, authors] = await Promise.all([getEntry('finance'), getNatureEdition('finance'), getAuthors()]);
      return { budget, natureBudget, authors };
    },
    { budget: null, natureBudget: null, authors: [] },
  );
  const budget = on && data.natureBudget ? data.natureBudget : data.budget;
  const { promoPrice } = newsletterSettings();
  recordSponsorRenewals();
  const funds = getSummary();
  const sponsors = sponsorSummary();

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{on ? 'Ministry of Finance' : 'Funding Closet Republic'}</h1>
          <p className="lede">{COMMUNITY_APPEAL}</p>
          <p className="lede">
            {on
              ? 'The proposed budget for the governance and management of the Republic. Citizens are kindly reminded that the tax is unfair and entirely optional.'
              : 'Closet Republic is run by volunteers and funded by donations. Here is where the money goes.'}
          </p>
          {(DONATE_URL || UPI_ID || SPONSORS_URL || btcpayConfigured()) && (
            <p className="hero__actions">
              {DONATE_URL && (
                <a className="button" href={DONATE_URL} target="_blank" rel="noopener noreferrer">
                  {on ? 'Pay your unfair tax' : DONATE_LABEL}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
              {SPONSORS_URL && (
                <a className={DONATE_URL ? 'button button--ghost' : 'button'} href={SPONSORS_URL} target="_blank" rel="noopener noreferrer">
                  Sponsor on GitHub
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
              {btcpayConfigured() && (
                <a className={DONATE_URL || SPONSORS_URL ? 'button button--ghost' : 'button'} href="#crypto-donate">
                  {on ? 'Pay tax in crypto' : 'Donate with crypto'}
                </a>
              )}
              {UPI_ID && (
                <a className={DONATE_URL || SPONSORS_URL || btcpayConfigured() ? 'button button--ghost' : 'button'} href={upiLink(UPI_ID)}>
                  {on ? 'Pay tax by UPI' : 'Pay by UPI'}
                  <span className="sr-only"> (opens your UPI app)</span>
                </a>
              )}
            </p>
          )}
          {UPI_ID && (
            <p className="hint">
              UPI ID: <code>{UPI_ID}</code>
            </p>
          )}
        </div>
        <Art name="consumer" nature={on} className="page-head__art" />
      </header>

      {thanks && <Notice>Thank you. Your crypto donation will appear in the treasury as soon as the network confirms it.</Notice>}
      {problem && <Notice tone="warn">{problem}</Notice>}

      <section aria-labelledby="collection-heading" className="section">
        <h2 id="collection-heading">{on ? 'Treasury' : 'Where the money stands'}</h2>
        <div className="fund-widgets">
          <FundWidget
            title={on ? `Tax collected in ${funds.monthLabel}` : `Monthly budget, ${funds.monthLabel}`}
            amount={funds.budget.raised}
            goal={funds.budget.goal}
            goalLabel={on ? 'target collection' : 'monthly goal'}
            hint={on ? 'The treasury is emptied with great ceremony on the 1st of every month.' : 'Starts again from zero on the 1st of every month.'}
            money={money}
          />
          <FundWidget
            title={on ? 'Legal defence fund' : 'Legal fund'}
            amount={funds.legal.balance}
            goal={funds.legal.goal}
            goalLabel="target"
            hint={on ? 'For challenging laws that try to put people back in boxes.' : 'Set aside for legal challenges. It does not reset.'}
            money={money}
          />
          <FundWidget
            title={on ? 'Ministry of Welfare' : 'Welfare fund'}
            amount={funds.welfare.balance}
            goal={funds.welfare.goal}
            goalLabel="target"
            hint={on ? 'Paid to the people who build the Republic, and to citizens who need a hand.' : 'Pays contributors and helps queer people in need. It does not reset.'}
            money={money}
          >
            <dl className="fund-split">
              <div>
                <dt>
                  {on ? 'Builders of the Republic' : 'Developers, artists, writers and interns'} ({funds.welfare.creatorsPct}%)
                </dt>
                <dd>{money(funds.welfare.creators)}</dd>
              </div>
              <div>
                <dt>
                  {on ? 'Mutual aid for citizens' : 'Need-based help for queer people'} ({100 - funds.welfare.creatorsPct}%)
                </dt>
                <dd>{money(funds.welfare.community)}</dd>
              </div>
            </dl>
          </FundWidget>
          <FundWidget
            title={on ? 'Department of Infrastructure' : 'Infrastructure fund'}
            amount={funds.infrastructure.balance}
            goal={funds.infrastructure.goal}
            goalLabel="target"
            hint={
              on
                ? 'Computers, tablets, accessories and servers, so the Republic stays standing.'
                : 'Computers, tablets, accessories, servers and other equipment. It does not reset.'
            }
            money={money}
          />
        </div>
        {sponsors.count > 0 && (
          <p className="hint sponsor-thanks">
            {sponsors.count} {sponsors.count === 1 ? 'person sponsors' : 'people sponsor'} us monthly on GitHub
            {sponsors.publicLogins.length > 0 && (
              <>
                . Thank you{' '}
                {sponsors.publicLogins.map((login, i) => (
                  <span key={login}>
                    {i > 0 && (i === sponsors.publicLogins.length - 1 ? ' and ' : ', ')}
                    <a href={`https://github.com/${encodeURIComponent(login)}`} target="_blank" rel="noopener noreferrer">
                      @{login}
                    </a>
                  </span>
                ))}
              </>
            )}
            .
          </p>
        )}
      </section>

      <p className="hint ledger-link">
        <Link href="/funding/ledger">{on ? 'Inspect every expense of the Republic' : 'See every expense in the public ledger'}</Link>
      </p>

      {btcpayConfigured() && (
        <section aria-labelledby="crypto-heading" className="section" id="crypto-donate">
          <h2 id="crypto-heading">{on ? 'Pay your tax in crypto' : 'Donate with crypto'}</h2>
          <CryptoDonate min={DONATION_MIN_USD} max={DONATION_MAX_USD} />
        </section>
      )}

      <section aria-labelledby="membership-heading" className="section" id="membership">
        <h2 id="membership-heading">{on ? 'Take a seat in the role-playing Republic' : 'Join the Discord server'}</h2>
        <p>
          Closet Republic has a role-playing Discord server where members take a class, from Alien to Middle Class, and play out life in the
          Republic. Memberships start at {promoPrice}. A class unlocks lounges and cosmetics and never buys votes or moderator powers.
        </p>
        <p className="hero__actions">
          {MEMBERSHIP_URL && (
            <a className="button" href={MEMBERSHIP_URL} target="_blank" rel="noopener noreferrer">
              Choose a class
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          <Link className={MEMBERSHIP_URL ? 'button button--ghost' : 'button'} href="/discord/link">
            Link your membership
          </Link>
        </p>
      </section>

      <section aria-labelledby="budget-heading" className="section">
        <h2 id="budget-heading">{on ? 'Proposed budget for governance and management' : 'Budget'}</h2>
        {budget ? <GhostContent html={budget.html} /> : !problem && <Notice>The budget has not been published yet (Ghost slug “finance”).</Notice>}
      </section>

      <section aria-labelledby="writers-heading" className="section">
        <h2 id="writers-heading">{on ? 'Fund your lawmaker’s campaign' : 'Writers seeking funding'}</h2>
        <p>
          {on
            ? 'These members of the GCR are campaigning for your generosity.'
            : 'These writers are looking for support for their work on Closet Republic.'}
        </p>
        <div className="card-grid">
          {data.authors.map((a) => (
            <AuthorCard key={a.id} author={a} nature={on} cta={on ? 'Fund this campaign' : 'View profile'} />
          ))}
        </div>
      </section>
    </>
  );
}
