'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

type Subscriber = { id: number; email: string; name: string | null; status: 'subscribed' | 'unsubscribed'; createdAt: string };
type Broadcast = { id: number; subject: string; total: number; sent: number; failed: number; status: 'sending' | 'done'; createdAt: string; finishedAt: string | null };
type Data = {
  counts: { subscribed: number; unsubscribed: number };
  subscribers: Subscriber[];
  broadcasts: Broadcast[];
  mailEnabled: boolean;
  lastExportAt: string | null;
  defaults: { githubUrl: string; donateUrl: string };
};

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

const DEFAULT_SUBJECT = 'Closet Republic has moved';
const DEFAULT_MESSAGE =
  'closetrepublic.com has been taken down, but the Republic carries on. Here is where to find us now. Please share this with anyone who needs it.';

export function LifelineAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setData(await api<Data>('/api/admin/lifeline')), []);
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);

  // While a notice is going out, refresh its progress every few seconds.
  const sending = data?.broadcasts.some((b) => b.status === 'sending');
  useEffect(() => {
    if (!sending) return;
    const t = setInterval(() => load().catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [sending, load]);

  if (!data) return <p>{message ?? 'Loading the Lifeline…'}</p>;
  const { counts, subscribers, broadcasts, mailEnabled, lastExportAt, defaults } = data;
  const stale = !lastExportAt || daysSince(lastExportAt) > 30;

  async function submit(form: HTMLFormElement, test: boolean) {
    if (!form.reportValidity()) return;
    const f = new FormData(form);
    const payload = Object.fromEntries(['subject', 'message', 'siteUrl', 'githubUrl', 'donateUrl', 'resources'].map((k) => [k, f.get(k)]));
    if (!test && !confirm(`Send this emergency notice to all ${counts.subscribed} subscribers now? This cannot be undone.`)) return;
    setBusy(true);
    try {
      if (test) {
        await api('/api/admin/lifeline/notice', { method: 'POST', body: JSON.stringify({ ...payload, test: true }) });
        setMessage('Test sent to your inbox (CONTRIBUTIONS_EMAIL).');
      } else {
        const r = await api<{ broadcast: { total: number } }>('/api/admin/lifeline/notice', { method: 'POST', body: JSON.stringify(payload) });
        setMessage(`Sending to ${r.broadcast.total} subscribers. Progress is shown below.`);
      }
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyBcc() {
    const list = subscribers.filter((s) => s.status === 'subscribed').map((s) => s.email).join(', ');
    try {
      await navigator.clipboard.writeText(list);
      setMessage(`Copied ${counts.subscribed} addresses. Paste them into the BCC field, never To or CC.`);
    } catch {
      setMessage('Could not copy. Download the CSV instead.');
    }
  }

  return (
    <div>
      <p className="lede">
        People who joined on <a href="/lifeline">/lifeline</a> to hear where the Republic went if this site is taken down.
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
      {message && <p className="notice">{message}</p>}

      <section className="lifeline-backup" aria-labelledby="backup-heading">
        <h2 id="backup-heading">Keep a copy off this server</h2>
        <p>
          If the site is taken down, this server and its database may go with it. Download the list regularly and keep it somewhere else, like your
          own computer or a private cloud folder. Any mail tool (Gmail, Proton, Brevo, Mailchimp) can import the CSV.
        </p>
        <p className={stale ? 'form-error' : 'hint'}>
          {lastExportAt ? `Last downloaded ${when(lastExportAt)}.` : 'Never downloaded yet.'}
          {stale && ' Time for a fresh copy.'}
        </p>
        <div className="admin-actions">
          <a className="button" href="/api/admin/lifeline/export" download onClick={() => setTimeout(() => load().catch(() => {}), 1000)}>
            Download CSV
          </a>
          <a className="link-button" href="/api/admin/lifeline/export?all=1" download>
            Include people who left
          </a>
          <button type="button" className="link-button" onClick={copyBcc}>
            Copy addresses for BCC
          </button>
        </div>
      </section>

      <dl className="stat-row">
        <div className="stat">
          <dt>Subscribed</dt>
          <dd>{counts.subscribed}</dd>
        </div>
        <div className="stat">
          <dt>Left</dt>
          <dd>{counts.unsubscribed}</dd>
        </div>
        <div className="stat">
          <dt>Email</dt>
          <dd className="stat__small">{mailEnabled ? 'Ready' : 'Not set up'}</dd>
        </div>
      </dl>

      <section className="section" aria-labelledby="notice-heading">
        <h2 id="notice-heading">Send an emergency notice</h2>
        <p>
          Emails everyone on the list, one at a time, each with their own unsubscribe link. Send a test to yourself first.
          {!mailEnabled && ' Email is not set up on this server, so use the CSV with another mail tool instead.'}
        </p>
        <form className="admin-card lifeline-notice" onSubmit={(e) => e.preventDefault()}>
          <div className="field">
            <label htmlFor="n-subject">Subject</label>
            <input id="n-subject" name="subject" required maxLength={200} defaultValue={DEFAULT_SUBJECT} />
          </div>
          <div className="field">
            <label htmlFor="n-message">Message</label>
            <textarea id="n-message" name="message" required rows={4} maxLength={5000} defaultValue={DEFAULT_MESSAGE} />
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="n-site">New site address</label>
              <input id="n-site" name="siteUrl" type="url" placeholder="https://" />
            </div>
            <div className="field">
              <label htmlFor="n-github">GitHub</label>
              <input id="n-github" name="githubUrl" type="url" defaultValue={defaults.githubUrl} />
            </div>
            <div className="field">
              <label htmlFor="n-donate">Donation link</label>
              <input id="n-donate" name="donateUrl" type="url" defaultValue={defaults.donateUrl} placeholder="https://" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="n-resources">Other resources (one per line)</label>
            <textarea id="n-resources" name="resources" rows={3} placeholder="Reddit: https://…" />
          </div>
          <div className="admin-actions">
            <button type="button" className="button button--ghost" disabled={busy || !mailEnabled} onClick={(e) => submit(e.currentTarget.form!, true)}>
              Send a test email
            </button>
            <button type="button" className="button" disabled={busy || !mailEnabled || counts.subscribed === 0} onClick={(e) => submit(e.currentTarget.form!, false)}>
              Send to {counts.subscribed} subscribers
            </button>
          </div>
        </form>
        {broadcasts.length > 0 && (
          <>
            <h3>Notices sent</h3>
            <ul className="plain-list">
              {broadcasts.map((b) => (
                <li key={b.id}>
                  <strong>{b.subject}</strong>
                  <div className="hint">
                    {when(b.createdAt)} · {b.sent} of {b.total} sent
                    {b.failed > 0 && `, ${b.failed} failed`} · {b.status === 'sending' ? 'sending…' : 'finished'}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="section" aria-labelledby="subs-heading">
        <h2 id="subs-heading">Subscribers</h2>
        <div className="table-scroll" data-no-swipe>
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Joined</th>
                <th scope="col">Email</th>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.createdAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</td>
                  <td>{s.email}</td>
                  <td>{s.name ?? '—'}</td>
                  <td>{s.status === 'subscribed' ? 'Subscribed' : 'Left'}</td>
                  <td className="admin-row-actions">
                    <button
                      className="link-button"
                      onClick={async () => {
                        if (!confirm(`Remove ${s.email} from the list for good?`)) return;
                        try {
                          await api(`/api/admin/lifeline/${s.id}`, { method: 'DELETE' });
                          setMessage(`${s.email} removed.`);
                          await load();
                        } catch (err) {
                          setMessage((err as Error).message);
                        }
                      }}
                    >
                      Delete<span className="sr-only"> {s.email}</span>
                    </button>
                  </td>
                </tr>
              ))}
              {subscribers.length === 0 && (
                <tr>
                  <td colSpan={5}>Nobody has joined yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
