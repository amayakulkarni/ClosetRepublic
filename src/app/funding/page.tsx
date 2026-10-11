import type { Metadata } from 'next';
import { getNature } from '@/lib/nature';
import { getAuthors, getEntry, getNatureEdition, safely } from '@/lib/ghost';
import { Art } from '@/components/Art';
import { AuthorCard } from '@/components/AuthorCard';
import { GhostContent } from '@/components/GhostContent';
import { Notice } from '@/components/Notice';

export const metadata: Metadata = { title: 'Ministry of Finance' };

const GOFUNDME_URL = process.env.NEXT_PUBLIC_GOFUNDME_URL || '';
const GOAL = Number(process.env.GOFUNDME_GOAL) || 0;
const RAISED = Number(process.env.GOFUNDME_RAISED) || 0;
const CURRENCY = process.env.GOFUNDME_CURRENCY || 'USD';

const money = (n: number) => new Intl.NumberFormat('en', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(n);

/** GoFundMe's embeddable widget lives at /f/<campaign>/widget/large. */
function widgetUrl(url: string) {
  const m = url.match(/gofundme\.com\/f\/([^/?#]+)/);
  return m ? `https://www.gofundme.com/f/${m[1]}/widget/large` : null;
}

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
  const pct = GOAL ? Math.min(100, Math.round((RAISED / GOAL) * 100)) : 0;
  const widget = GOFUNDME_URL ? widgetUrl(GOFUNDME_URL) : null;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{on ? 'Ministry of Finance' : 'Funding Closet Republic'}</h1>
          <p className="lede">
            {on
              ? 'The proposed budget for the governance and management of the Republic. Citizens are kindly reminded that the tax is unfair and entirely optional.'
              : 'Closet Republic is run by volunteers and funded by a GoFundMe campaign. Here is where the money goes.'}
          </p>
          {GOFUNDME_URL && (
            <p>
              <a className="button" href={GOFUNDME_URL} target="_blank" rel="noopener noreferrer">
                {on ? 'Pay your unfair tax' : 'Donate on GoFundMe'}
                <span className="sr-only"> (opens GoFundMe in a new tab)</span>
              </a>
            </p>
          )}
        </div>
        <Art name="consumer" nature={on} className="page-head__art" />
      </header>

      {problem && <Notice tone="warn">{problem}</Notice>}

      <section aria-labelledby="collection-heading" className="section stats">
        <h2 id="collection-heading">{on ? 'Tax collection' : 'Fundraising progress'}</h2>
        {GOAL > 0 ? (
          <>
            <dl className="stat-row">
              <div className="stat">
                <dt>{on ? 'Tax collected' : 'Raised'}</dt>
                <dd>{money(RAISED)}</dd>
              </div>
              <div className="stat">
                <dt>{on ? 'Target collection' : 'Goal'}</dt>
                <dd>{money(GOAL)}</dd>
              </div>
              <div className="stat">
                <dt>{on ? 'Treasury filled' : 'Progress'}</dt>
                <dd>{pct}%</dd>
              </div>
            </dl>
            <div
              className="meter"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={GOAL}
              aria-valuenow={RAISED}
              aria-valuetext={`${money(RAISED)} of ${money(GOAL)}, ${pct}%`}
            >
              <span style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <Notice>The fundraising goal has not been set yet.</Notice>
        )}
        {widget && (
          <iframe
            className="gofundme-widget"
            src={widget}
            title="GoFundMe campaign widget for Closet Republic, showing the amount raised and the goal"
            loading="lazy"
          />
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
