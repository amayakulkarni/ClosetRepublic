'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type Fund = 'budget' | 'legal';
type Entry = {
  id: number;
  fund: Fund;
  kind: string;
  amountMinor: number;
  originalAmount: number | null;
  originalCurrency: string | null;
  source: string;
  supporterName: string | null;
  note: string | null;
  month: string;
  createdAt: string;
};
type Overview = {
  settings: { budgetGoal: number; legalGoal: number; donationFund: Fund };
  summary: { currency: string; month: string; monthLabel: string; budget: { raised: number; goal: number }; legal: { balance: number; goal: number } };
  history: { month: string; total: number }[];
};

const FUND_LABEL: Record<Fund, string> = { budget: 'Monthly budget', legal: 'Legal fund' };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export function AdminDashboard() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [filter, setFilter] = useState<{ fund: '' | Fund; month: string }>({ fund: '', month: '' });
  const [message, setMessage] = useState<string | null>(null);

  const money = useCallback(
    (n: number) =>
      new Intl.NumberFormat(overview?.summary.currency === 'INR' ? 'en-IN' : 'en', {
        style: 'currency',
        currency: overview?.summary.currency || 'INR',
      }).format(n),
    [overview?.summary.currency],
  );

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (filter.fund) q.set('fund', filter.fund);
    if (filter.month) q.set('month', filter.month);
    const [o, l] = await Promise.all([api<Overview>('/api/admin/settings'), api<{ entries: Entry[] }>(`/api/admin/ledger?${q}`)]);
    setOverview(o);
    setEntries(l.entries);
  }, [filter]);

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);

  const run = (fn: () => Promise<unknown>, done: string) => async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const form = e?.currentTarget;
    try {
      await fn();
      setMessage(done);
      form?.reset();
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  if (!overview) return <p>{message ?? 'Loading the treasury…'}</p>;
  const { summary, settings, history } = overview;

  return (
    <div className="admin">
      <header className="page-head">
        <div>
          <h1>Treasury admin</h1>
          <p className="lede">Monthly budget for {summary.monthLabel} and the legal fund.</p>
        </div>
        <button
          className="button button--ghost"
          onClick={async () => {
            await fetch('/api/admin/session', { method: 'DELETE' });
            router.refresh();
          }}
        >
          Sign out
        </button>
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
      {message && <p className="notice">{message}</p>}

      <dl className="stat-row">
        <div className="stat">
          <dt>Budget this month</dt>
          <dd>{money(summary.budget.raised)}</dd>
          <p className="hint">of {money(summary.budget.goal)} goal</p>
        </div>
        <div className="stat">
          <dt>Legal fund</dt>
          <dd>{money(summary.legal.balance)}</dd>
          {summary.legal.goal > 0 && <p className="hint">of {money(summary.legal.goal)} target</p>}
        </div>
        <div className="stat">
          <dt>Buy Me a Coffee goes to</dt>
          <dd className="stat__small">{FUND_LABEL[settings.donationFund]}</dd>
        </div>
      </dl>

      <div className="admin-grid">
        <form
          className="admin-card"
          onSubmit={run(async () => {
            const f = new FormData(document.getElementById('entry-form') as HTMLFormElement);
            await api('/api/admin/ledger', {
              method: 'POST',
              body: JSON.stringify({ fund: f.get('fund'), kind: f.get('kind'), amount: f.get('amount'), note: f.get('note') }),
            });
          }, 'Entry added.')}
          id="entry-form"
        >
          <h2>Add an entry</h2>
          <div className="field">
            <label htmlFor="e-fund">Fund</label>
            <select id="e-fund" name="fund" defaultValue="legal">
              <option value="legal">Legal fund</option>
              <option value="budget">Monthly budget</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="e-kind">Type</label>
            <select id="e-kind" name="kind" defaultValue="deduction">
              <option value="deduction">Deduction (money spent)</option>
              <option value="credit">Credit (money received)</option>
              <option value="adjustment">Adjustment (signed correction)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="e-amount">Amount ({summary.currency})</label>
            <input id="e-amount" name="amount" type="number" step="0.01" required />
          </div>
          <div className="field">
            <label htmlFor="e-note">Note</label>
            <input id="e-note" name="note" placeholder="e.g. Court filing fee" />
          </div>
          <button className="button">Add entry</button>
        </form>

        <form
          className="admin-card"
          id="balance-form"
          onSubmit={run(async () => {
            const f = new FormData(document.getElementById('balance-form') as HTMLFormElement);
            await api('/api/admin/legal-balance', { method: 'PUT', body: JSON.stringify({ balance: f.get('balance'), note: f.get('note') || undefined }) });
          }, 'Legal fund balance updated.')}
        >
          <h2>Set legal fund balance</h2>
          <p className="hint">Records an adjustment for the difference, so the history stays intact.</p>
          <div className="field">
            <label htmlFor="b-balance">New balance ({summary.currency})</label>
            <input id="b-balance" name="balance" type="number" step="0.01" required defaultValue={summary.legal.balance} />
          </div>
          <div className="field">
            <label htmlFor="b-note">Note</label>
            <input id="b-note" name="note" placeholder="e.g. Matched bank statement" />
          </div>
          <button className="button">Set balance</button>
        </form>

        <form
          className="admin-card"
          id="settings-form"
          onSubmit={run(async () => {
            const f = new FormData(document.getElementById('settings-form') as HTMLFormElement);
            await api('/api/admin/settings', {
              method: 'PUT',
              body: JSON.stringify({ budgetGoal: f.get('budgetGoal'), legalGoal: f.get('legalGoal'), donationFund: f.get('donationFund') }),
            });
          }, 'Settings saved.')}
        >
          <h2>Settings</h2>
          <div className="field">
            <label htmlFor="s-budget">Monthly budget goal ({summary.currency})</label>
            <input id="s-budget" name="budgetGoal" type="number" step="1" min="0" defaultValue={settings.budgetGoal} />
          </div>
          <div className="field">
            <label htmlFor="s-legal">Legal fund target ({summary.currency}, 0 for none)</label>
            <input id="s-legal" name="legalGoal" type="number" step="1" min="0" defaultValue={settings.legalGoal} />
          </div>
          <div className="field">
            <label htmlFor="s-fund">Buy Me a Coffee money goes to</label>
            <select id="s-fund" name="donationFund" defaultValue={settings.donationFund}>
              <option value="budget">Monthly budget</option>
              <option value="legal">Legal fund</option>
            </select>
          </div>
          <button className="button">Save settings</button>
        </form>
      </div>

      <section className="section" aria-labelledby="ledger-heading">
        <h2 id="ledger-heading">Ledger</h2>
        <div className="admin-filters">
          <div className="field">
            <label htmlFor="f-fund">Fund</label>
            <select id="f-fund" value={filter.fund} onChange={(e) => setFilter({ ...filter, fund: e.target.value as '' | Fund })}>
              <option value="">Both</option>
              <option value="budget">Monthly budget</option>
              <option value="legal">Legal fund</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-month">Month</label>
            <input id="f-month" type="month" value={filter.month} onChange={(e) => setFilter({ ...filter, month: e.target.value })} />
          </div>
        </div>
        <div className="table-scroll" data-no-swipe>
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Fund</th>
                <th scope="col">Type</th>
                <th scope="col">Amount</th>
                <th scope="col">From / note</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.createdAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</td>
                  <td>{FUND_LABEL[e.fund]}</td>
                  <td>{e.kind}</td>
                  <td className={e.amountMinor < 0 ? 'neg' : ''}>
                    {money(e.amountMinor / 100)}
                    {e.originalCurrency && e.originalCurrency !== summary.currency && (
                      <span className="hint">
                        {' '}
                        ({e.originalAmount} {e.originalCurrency})
                      </span>
                    )}
                  </td>
                  <td>{[e.source === 'buymeacoffee' ? `Buy Me a Coffee${e.supporterName ? `: ${e.supporterName}` : ''}` : 'Admin', e.note].filter(Boolean).join(' · ')}</td>
                  <td>
                    <button
                      className="link-button"
                      onClick={() => {
                        if (confirm(`Delete this ${e.kind} of ${money(e.amountMinor / 100)}?`))
                          run(() => api(`/api/admin/ledger/${e.id}`, { method: 'DELETE' }), 'Entry deleted.')();
                      }}
                    >
                      Delete<span className="sr-only"> entry {e.id}</span>
                    </button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6}>No entries yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {history.length > 0 && (
        <section className="section" aria-labelledby="history-heading">
          <h2 id="history-heading">Monthly budget history</h2>
          <ul className="link-list">
            {history.map((h) => (
              <li key={h.month}>
                <button className="link-button" onClick={() => setFilter({ fund: 'budget', month: h.month })}>
                  {h.month}: {money(h.total)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
