import type { Metadata } from 'next';
import Link from 'next/link';
import { getNature } from '@/lib/nature';
import { CURRENCY, TIMEZONE, listPublicExpenses, monthLabel, type Fund, type WelfarePot } from '@/lib/funds';
import { Notice } from '@/components/Notice';

export const metadata: Metadata = {
  title: 'Public expense ledger',
  description: 'Every expense paid out of the Closet Republic treasury, by date, fund and amount.',
};
export const dynamic = 'force-dynamic';

const money = (n: number) =>
  new Intl.NumberFormat(CURRENCY === 'INR' ? 'en-IN' : 'en', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 2 }).format(n);

const FUND_LABEL: Record<Fund, { plain: string; nature: string }> = {
  budget: { plain: 'Monthly budget', nature: 'Treasury' },
  legal: { plain: 'Legal fund', nature: 'Legal defence fund' },
  welfare: { plain: 'Welfare fund', nature: 'Ministry of Welfare' },
  infrastructure: { plain: 'Infrastructure fund', nature: 'Department of Infrastructure' },
};
const POT_LABEL: Record<WelfarePot, string> = {
  creators: 'developers, artists, writers and interns',
  community: 'need-based help',
};

export default async function LedgerPage() {
  const { on } = await getNature();
  const expenses = listPublicExpenses();
  const months = new Map<string, typeof expenses>();
  for (const e of expenses) months.set(e.month, [...(months.get(e.month) ?? []), e]);
  const total = expenses.reduce((n, e) => n + e.spentMinor, 0);

  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <Link href="/funding">Funding</Link>
          </p>
          <h1>Public expense ledger</h1>
          <p className="lede">
            Every expense paid out of the Closet Republic treasury, newest first. Donors are never named here, and money received is shown only as
            the totals on the funding page.
          </p>
        </div>
      </header>

      {expenses.length === 0 ? (
        <Notice>No expenses have been recorded yet.</Notice>
      ) : (
        <>
          <p className="ledger-total">
            Total spent so far: <strong>{money(total / 100)}</strong> across {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}.
          </p>
          {[...months].map(([month, rows]) => (
            <section key={month} className="section" aria-labelledby={`m-${month}`}>
              <h2 id={`m-${month}`}>
                {monthLabel(month)} <span className="hint">({money(rows.reduce((n, e) => n + e.spentMinor, 0) / 100)})</span>
              </h2>
              <div className="table-scroll" data-no-swipe>
                <table className="ledger">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Fund</th>
                      <th scope="col">What it was for</th>
                      <th scope="col">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr key={e.id}>
                        <td>{new Date(e.createdAt).toLocaleDateString('en-GB', { dateStyle: 'medium', timeZone: TIMEZONE })}</td>
                        <td>
                          {FUND_LABEL[e.fund].plain}
                          {e.pot && <span className="hint"> ({POT_LABEL[e.pot]})</span>}
                        </td>
                        <td>
                          {e.kind === 'refund' && <span className="hint">Refund. </span>}
                          {e.note || 'No description'}
                        </td>
                        <td className="neg">{money(e.spentMinor / 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
