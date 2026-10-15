import type { Metadata } from 'next';
import { getNature } from '@/lib/nature';
import { getAuthors, getEntry, getNatureEdition, safely } from '@/lib/ghost';
import { Art } from '@/components/Art';
import { AuthorCard } from '@/components/AuthorCard';
import { GhostContent } from '@/components/GhostContent';
import { Notice } from '@/components/Notice';
import { FundWidget } from '@/components/FundWidget';
import { CURRENCY, getSummary } from '@/lib/funds';
import { recordSponsorRenewals, sponsorSummary } from '@/lib/github-sponsors';
import { btcpayConfigured } from '@/lib/btcpay';

export const metadata: Metadata = { title: 'Ministry of Finance' };
export const dynamic = 'force-dynamic';

// Donations go through Buy Me a Coffee and GitHub Sponsors (their webhooks keep the treasury
// up to date), plus an optional UPI ID.
// The older NEXT_PUBLIC_GOFUNDME_URL is still read so existing .env files keep working.
const env = (name: string, legacy?: string) => process.env[name] || (legacy ? process.env[legacy] : '') || '';
const DONATE_URL = env('NEXT_PUBLIC_DONATE_URL', 'NEXT_PUBLIC_GOFUNDME_URL');
const DONATE_LABEL = env('NEXT_PUBLIC_DONATE_LABEL') || 'Buy me a compute';
const UPI_ID = env('NEXT_PUBLIC_UPI_ID');
const SPONSORS_URL = env('NEXT_PUBLIC_GITHUB_SPONSORS_URL');
const UPI_NAME = env('NEXT_PUBLIC_UPI_NAME') || 'Closet Republic';

const money = (n: number) =>
  new Intl.NumberFormat(CURRENCY === 'INR' ? 'en-IN' : 'en', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(n);

/** Opens the visitor's UPI app (GPay, PhonePe, Paytm, BHIM…) with the payee filled in. */
const upiLink = (id: string) => `upi://pay?pa=${encodeURIComponent(id)}&pn=${encodeURIComponent(UPI_NAME)}&cu=INR`;

export default async function FundingPage() {
  const { on } = await getNature();
  const { data, problem } = await safely(
    async () => {
      const [budget, natureBudget, authors] = await Promise.all([getEntry('finance'), getNatureEdition('finance'), getAuthors()]);
      return { budget, natureBudget, authors };
    },
    { budget: null, natureBudget: null, authors: [] },
  );
  const budget = on && data.natureBudget ? data.natureBudget : data.budget;
  recordSponsorRenewals();
  const funds = getSummary();
  const sponsors = sponsorSummary();

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{on ? 'Ministry of Finance' : 'Funding Closet Republic'}</h1>
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
                <a className={DONATE_URL || SPONSORS_URL ? 'button button--ghost' : 'button'} href="/discord/link#crypto">
                  {on ? 'Pay tax in crypto' : 'Pay with crypto'}
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
