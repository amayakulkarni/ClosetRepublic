'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { AREA_LABEL, CONTRIBUTION_AREAS, CONTRIBUTOR_STATUSES, type ContributionArea, type ContributorStatus } from '@/lib/contribution-areas';

type Contributor = {
  id: number;
  area: ContributionArea;
  name: string;
  pronouns: string | null;
  email: string;
  portfolioUrl: string;
  status: ContributorStatus;
  adminNote: string | null;
  createdAt: string;
  lastEmail: EmailEntry | null;
};
type EmailEntry = { id: number; kind: string; to: string; subject: string; status: 'sent' | 'failed' | 'skipped'; error: string | null; createdAt: string };
type MailResult = { status: 'sent' | 'failed' | 'skipped'; error?: string } | null;

const KIND_LABEL: Record<string, string> = { confirmation: 'Confirmation', verified: 'Verified', declined: 'Declined', message: 'Message', 'admin-alert': 'Alert to you' };
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** "Email sent." / "Email failed: …" for the status line. */
function mailNote(r: MailResult) {
  if (!r) return '';
  if (r.status === 'sent') return ' Email sent.';
  if (r.status === 'skipped') return ' No email sent: email is not set up.';
  return ` Email failed: ${r.error}`;
}

const STATUS_LABEL: Record<ContributorStatus, string> = { new: 'New', verifying: 'Verifying', verified: 'Verified', declined: 'Declined' };

export function ContributorsAdmin() {
  const [rows, setRows] = useState<Contributor[] | null>(null);
  const [counts, setCounts] = useState<Partial<Record<ContributionArea, number>>>({});
  const [filter, setFilter] = useState<{ area: '' | ContributionArea; status: '' | ContributorStatus }>({ area: '', status: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [mailEnabled, setMailEnabled] = useState(true);
  const [notify, setNotify] = useState(true);
  const [composing, setComposing] = useState<Contributor | null>(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (filter.area) q.set('area', filter.area);
    if (filter.status) q.set('status', filter.status);
    const data = await api<{ contributors: Contributor[]; newCounts: typeof counts; mailEnabled: boolean }>(`/api/admin/contributors?${q}`);
    setRows(data.contributors);
    setCounts(data.newCounts);
    setMailEnabled(data.mailEnabled);
  }, [filter]);

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);

  const run = async <T,>(fn: () => Promise<T>, done: string | ((result: T) => string)) => {
    try {
      const result = await fn();
      setMessage(typeof done === 'string' ? done : done(result));
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  if (!rows) return <p>{message ?? 'Loading contributors…'}</p>;

  return (
    <div>
      <p className="lede">
        Sign-ups from the Constitution, Writing and Artwork tabs on <a href="/development">/development</a>. Check that each portfolio link really
        is their public work before marking them verified.
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
      {message && <p className="notice">{message}</p>}
      {!mailEnabled && (
        <p className="notice notice--warn">
          Email is off. Add <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>, <code>MAIL_FROM</code> and{' '}
          <code>CONTRIBUTIONS_EMAIL</code> to the server&rsquo;s <code>.env.local</code> and restart to send confirmations and updates.
        </p>
      )}

      <dl className="stat-row">
        {CONTRIBUTION_AREAS.map((a) => (
          <div className="stat" key={a}>
            <dt>New: {AREA_LABEL[a].plain}</dt>
            <dd>{counts[a] ?? 0}</dd>
          </div>
        ))}
      </dl>

      <section className="section" aria-labelledby="contributors-heading">
        <h2 id="contributors-heading">Contributors</h2>
        <div className="admin-filters">
          <div className="field">
            <label htmlFor="c-area">Area</label>
            <select id="c-area" value={filter.area} onChange={(e) => setFilter({ ...filter, area: e.target.value as '' | ContributionArea })}>
              <option value="">All</option>
              {CONTRIBUTION_AREAS.map((a) => (
                <option key={a} value={a}>
                  {AREA_LABEL[a].plain}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-status">Status</label>
            <select id="c-status" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as '' | ContributorStatus })}>
              <option value="">All</option>
              {CONTRIBUTOR_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          {mailEnabled && (
            <label className="check admin-filters__check">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              <span>Email contributors when I verify or decline them</span>
            </label>
          )}
        </div>
        <div className="table-scroll" data-no-swipe>
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Received</th>
                <th scope="col">Area</th>
                <th scope="col">Person</th>
                <th scope="col">Portfolio</th>
                <th scope="col">Status</th>
                <th scope="col">Last email</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.createdAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</td>
                  <td>{AREA_LABEL[c.area].plain}</td>
                  <td>
                    <strong>{c.name}</strong>
                    {c.pronouns && <span className="hint"> ({c.pronouns})</span>}
                    <div>
                      <a href={`mailto:${c.email}`}>{c.email}</a>
                    </div>
                    {c.adminNote && <div className="hint">Note: {c.adminNote}</div>}
                  </td>
                  <td className="admin-link-cell">
                    <a href={c.portfolioUrl} target="_blank" rel="noopener noreferrer nofollow">
                      {c.portfolioUrl}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`status-${c.id}`}>
                      Status of {c.name}
                    </label>
                    <select
                      id={`status-${c.id}`}
                      className="inline-select"
                      value={c.status}
                      onChange={(e) => {
                        const status = e.target.value as ContributorStatus;
                        run(
                          () => api<{ email: MailResult }>(`/api/admin/contributors/${c.id}`, { method: 'PUT', body: JSON.stringify({ status, notify }) }),
                          (r) => `${c.name} marked ${STATUS_LABEL[status].toLowerCase()}.${mailNote(r.email)}`,
                        );
                      }}
                    >
                      {CONTRIBUTOR_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {c.lastEmail ? (
                      <>
                        {KIND_LABEL[c.lastEmail.kind] ?? c.lastEmail.kind}
                        <div className="hint">
                          {c.lastEmail.status === 'sent' ? 'sent' : c.lastEmail.status === 'failed' ? 'failed' : 'not sent'} · {when(c.lastEmail.createdAt)}
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="admin-row-actions">
                    <button className="link-button" onClick={() => setComposing(c)}>
                      Email<span className="sr-only"> {c.name}</span>
                    </button>
                    <button
                      className="link-button"
                      onClick={() => {
                        const note = prompt(`Private note about ${c.name} (only admins see it)`, c.adminNote ?? '');
                        if (note !== null) run(() => api(`/api/admin/contributors/${c.id}`, { method: 'PUT', body: JSON.stringify({ adminNote: note }) }), 'Note saved.');
                      }}
                    >
                      Note<span className="sr-only"> about {c.name}</span>
                    </button>
                    <button
                      className="link-button"
                      onClick={() =>
                        confirm(`Delete ${c.name}'s details for good?`) && run(() => api(`/api/admin/contributors/${c.id}`, { method: 'DELETE' }), 'Contributor deleted.')
                      }
                    >
                      Delete<span className="sr-only"> {c.name}</span>
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7}>No sign-ups yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {composing && (
        <EmailDialog
          contributor={composing}
          mailEnabled={mailEnabled}
          onClose={() => setComposing(null)}
          onSent={(text) => {
            setMessage(text);
            load().catch(() => {});
          }}
        />
      )}
    </div>
  );
}

/** Write to one contributor, and see every email sent to them. */
function EmailDialog({
  contributor: c,
  mailEnabled,
  onClose,
  onSent,
}: {
  contributor: Contributor;
  mailEnabled: boolean;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [history, setHistory] = useState<EmailEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
    api<{ emails: EmailEntry[] }>(`/api/admin/contributors/${c.id}/email`)
      .then((d) => setHistory(d.emails))
      .catch((e) => setError(e.message));
  }, [c.id]);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/contributors/${c.id}/email`, { method: 'POST', body: JSON.stringify({ subject: f.get('subject'), message: f.get('message') }) });
      onSent(`Email sent to ${c.name}.`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="admin-dialog" onClose={onClose} aria-labelledby="email-dialog-heading">
      <h2 id="email-dialog-heading">Email {c.name}</h2>
      <p className="hint">
        To {c.email}. Their greeting and the Closet Republic sign-off are added for you.
      </p>
      <form className="admin-dialog__form" onSubmit={send}>
        <div className="field">
          <label htmlFor="m-subject">Subject</label>
          <input id="m-subject" name="subject" required maxLength={200} disabled={!mailEnabled} />
        </div>
        <div className="field">
          <label htmlFor="m-message">Message</label>
          <textarea id="m-message" name="message" required rows={7} maxLength={5000} disabled={!mailEnabled} />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="admin-actions">
          <button className="button" disabled={busy || !mailEnabled}>
            {busy ? 'Sending…' : 'Send email'}
          </button>
          <button type="button" className="link-button" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
      </form>
      <h3>Sent so far</h3>
      {history === null ? (
        <p>Loading…</p>
      ) : history.length === 0 ? (
        <p>No emails yet.</p>
      ) : (
        <ul className="plain-list email-history">
          {history.map((h) => (
            <li key={h.id}>
              <strong>{h.subject}</strong>
              <div className="hint">
                {KIND_LABEL[h.kind] ?? h.kind} to {h.to} · {h.status === 'sent' ? 'sent' : h.status === 'failed' ? `failed: ${h.error}` : 'not sent (email off)'} · {when(h.createdAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </dialog>
  );
}
