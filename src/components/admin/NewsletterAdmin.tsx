'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

type Post = { slug: string; title: string; excerpt: string; image: string | null; publishedAt: string | null };
type Issue = { id: number; subject: string; total: number; sent: number; failed: number; status: 'sending' | 'done'; createdAt: string; finishedAt: string | null };
type Overview = { counts: { subscribed: number; pending: number; unsubscribed: number }; issues: Issue[]; mailgun: boolean; testTo: string };
type Sub = { id: number; email: string; status: 'pending' | 'subscribed' | 'unsubscribed'; createdAt: string; confirmedAt: string | null };
type Pick = 'featured' | 'recommended';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '');

export function NewsletterAdmin() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [q, setQ] = useState('');
  const [days, setDays] = useState('30');
  // Choices survive filter changes, so a post picked earlier stays picked.
  const [picked, setPicked] = useState<Record<string, Pick>>({});
  const known = useRef<Map<string, Post>>(new Map());
  const [subject, setSubject] = useState('');
  const [intro, setIntro] = useState('');
  const [testTo, setTestTo] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [subQ, setSubQ] = useState('');
  const [subStatus, setSubStatus] = useState('');

  const say = (text: string, error = false) => setMessage({ text, error });
  const loadOverview = useCallback(async () => {
    const o = await api<Overview>('/api/admin/newsletter');
    setOverview(o);
    setTestTo((t) => t || o.testTo);
  }, []);
  useEffect(() => {
    loadOverview().catch((e) => say(e.message, true));
  }, [loadOverview]);

  // Posts reload when the filter changes (typing is debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      api<{ posts: Post[] }>(`/api/admin/newsletter/posts?days=${days}&q=${encodeURIComponent(q)}`)
        .then((r) => {
          r.posts.forEach((p) => known.current.set(p.slug, p));
          setPosts(r.posts);
        })
        .catch((e) => {
          setPosts([]);
          say(e.message, true);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [q, days]);

  const loadSubs = useCallback(async () => {
    const r = await api<{ subscribers: Sub[] }>(`/api/admin/newsletter/subscribers?q=${encodeURIComponent(subQ)}&status=${subStatus}`);
    setSubs(r.subscribers);
  }, [subQ, subStatus]);
  useEffect(() => {
    const t = setTimeout(() => loadSubs().catch((e) => say(e.message, true)), 250);
    return () => clearTimeout(t);
  }, [loadSubs]);

  // While an issue is going out, refresh its progress.
  const sending = overview?.issues.some((i) => i.status === 'sending');
  useEffect(() => {
    if (!sending) return;
    const t = setInterval(() => loadOverview().catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [sending, loadOverview]);

  const choose = (slug: string, as: Pick, on: boolean) =>
    setPicked((p) => {
      const next = { ...p };
      if (on) next[slug] = as;
      else delete next[slug];
      return next;
    });
  const slugsFor = (as: Pick) => Object.entries(picked).filter(([, v]) => v === as).map(([s]) => s);
  const payload = (action: string, extra: object = {}) => ({ action, subject, intro, featured: slugsFor('featured'), recommended: slugsFor('recommended'), ...extra });

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      say((e as Error).message, true);
    }
    setBusy(false);
  }

  if (!overview) return <p>{message?.text ?? 'Loading the newsletter…'}</p>;
  const { counts, issues, mailgun } = overview;
  const chosen = Object.keys(picked).length;

  return (
    <div className="admin-sections">
      {!mailgun && (
        <p className="form-error" role="alert">
          Mailgun is not set up, so nothing can be sent. Set <code>MAILGUN_API_KEY</code>, <code>MAILGUN_DOMAIN</code> and <code>NEWSLETTER_FROM</code> on the server.
        </p>
      )}
      {message && (
        <p className={message.error ? 'form-error' : 'notice'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}

      <section className="admin-card" aria-labelledby="nl-write">
        <h2 id="nl-write">Write an issue</h2>
        <p className="hint">
          {counts.subscribed} confirmed {counts.subscribed === 1 ? 'subscriber' : 'subscribers'}, {counts.pending} waiting to confirm.
        </p>
        <div className="field">
          <label htmlFor="nl-subject">Subject</label>
          <input id="nl-subject" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="nl-intro">Introduction</label>
          <textarea id="nl-intro" rows={5} value={intro} maxLength={4000} onChange={(e) => setIntro(e.target.value)} />
          <p className="hint">Plain text. A blank line starts a new paragraph.</p>
        </div>

        <h3>Posts</h3>
        <div className="admin-filters">
          <div className="field">
            <label htmlFor="nl-q">Search titles</label>
            <input id="nl-q" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="nl-days">Published</label>
            <select id="nl-days" value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="7">In the last 7 days</option>
              <option value="14">In the last 14 days</option>
              <option value="30">In the last 30 days</option>
              <option value="90">In the last 90 days</option>
              <option value="365">In the last year</option>
              <option value="0">All time</option>
            </select>
          </div>
        </div>
        <p className="hint">
          Feature puts a post in &ldquo;In this issue&rdquo; with its picture and excerpt. Recommend lists it under &ldquo;Also worth reading&rdquo;. {chosen} chosen.
        </p>
        <div className="table-scroll" data-no-swipe>
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Recommend</th>
                <th scope="col">Post</th>
                <th scope="col">Published</th>
              </tr>
            </thead>
            <tbody>
              {(posts ?? []).map((p) => (
                <tr key={p.slug}>
                  <td>
                    <input type="checkbox" aria-label={`Feature: ${p.title}`} checked={picked[p.slug] === 'featured'} onChange={(e) => choose(p.slug, 'featured', e.target.checked)} />
                  </td>
                  <td>
                    <input type="checkbox" aria-label={`Recommend: ${p.title}`} checked={picked[p.slug] === 'recommended'} onChange={(e) => choose(p.slug, 'recommended', e.target.checked)} />
                  </td>
                  <td>
                    {p.title}
                    {!p.image && <span className="hint"> (no usable picture)</span>}
                  </td>
                  <td>{day(p.publishedAt)}</td>
                </tr>
              ))}
              {posts && posts.length === 0 && (
                <tr>
                  <td colSpan={4}>No posts match this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {Object.keys(picked).filter((s) => !(posts ?? []).some((p) => p.slug === s)).length > 0 && (
          <p className="hint">
            Also chosen but hidden by the filter:{' '}
            {Object.keys(picked)
              .filter((s) => !(posts ?? []).some((p) => p.slug === s))
              .map((s) => known.current.get(s)?.title ?? s)
              .join(', ')}
            .
          </p>
        )}

        <div className="admin-actions">
          <button
            className="button button--ghost"
            type="button"
            disabled={busy || !subject}
            onClick={() =>
              run(async () => {
                const r = await api<{ html: string; missing: number }>('/api/admin/newsletter/compose', { method: 'POST', body: JSON.stringify(payload('preview')) });
                setPreview(r.html);
                if (r.missing) say(`${r.missing} chosen post(s) are no longer in Ghost and were left out.`, true);
              })
            }
          >
            Preview
          </button>
          <div className="field">
            <label htmlFor="nl-test">Send a test to</label>
            <input id="nl-test" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          </div>
          <button
            className="button button--ghost"
            type="button"
            disabled={busy || !subject || !testTo}
            onClick={() =>
              run(async () => {
                await api('/api/admin/newsletter/compose', { method: 'POST', body: JSON.stringify(payload('test', { to: testTo })) });
                say(`Test sent to ${testTo}.`);
              })
            }
          >
            Send test
          </button>
          <button
            className="button"
            type="button"
            disabled={busy || !subject || !mailgun || counts.subscribed === 0}
            onClick={() => {
              if (!confirm(`Send "${subject}" to ${counts.subscribed} subscribers now? This cannot be undone.`)) return;
              run(async () => {
                const r = await api<{ total: number }>('/api/admin/newsletter/compose', { method: 'POST', body: JSON.stringify(payload('send', { expectedCount: counts.subscribed })) });
                say(`Sending to ${r.total} subscribers. Progress is shown under Sent issues.`);
                await loadOverview();
              });
            }}
          >
            Send to {counts.subscribed} subscribers
          </button>
        </div>
        {preview && (
          <div>
            <h3>Preview</h3>
            <iframe title="Newsletter preview" sandbox="" srcDoc={preview} className="newsletter-preview" />
          </div>
        )}
      </section>

      <section className="admin-card" aria-labelledby="nl-issues">
        <h2 id="nl-issues">Sent issues</h2>
        {issues.length === 0 ? (
          <p>No issue has been sent yet.</p>
        ) : (
          <div className="table-scroll" data-no-swipe>
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">Sent</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Delivered</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((i) => (
                  <tr key={i.id}>
                    <td>{when(i.createdAt)}</td>
                    <td>{i.subject}</td>
                    <td>
                      {i.sent} of {i.total}
                      {i.failed > 0 && <span className="hint"> ({i.failed} failed, see the server log)</span>}
                    </td>
                    <td>{i.status === 'sending' ? (Date.now() - Date.parse(i.createdAt) > 3_600_000 ? 'Interrupted' : 'Sending…') : 'Done'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-card" aria-labelledby="nl-subs">
        <h2 id="nl-subs">Subscribers</h2>
        <p className="hint">
          {counts.subscribed} confirmed, {counts.pending} unconfirmed (deleted after 7 days), {counts.unsubscribed} unsubscribed (deleted after 30 days).{' '}
          <a href="/api/admin/newsletter/export">Download CSV</a>
        </p>
        <div className="admin-filters">
          <div className="field">
            <label htmlFor="nl-subq">Search</label>
            <input id="nl-subq" value={subQ} onChange={(e) => setSubQ(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="nl-substatus">Status</label>
            <select id="nl-substatus" value={subStatus} onChange={(e) => setSubStatus(e.target.value)}>
              <option value="">All</option>
              <option value="subscribed">Confirmed</option>
              <option value="pending">Unconfirmed</option>
              <option value="unsubscribed">Unsubscribed</option>
            </select>
          </div>
        </div>
        <div className="table-scroll" data-no-swipe>
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Status</th>
                <th scope="col">Signed up</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(subs ?? []).map((s) => (
                <tr key={s.id}>
                  <td>{s.email}</td>
                  <td>{s.status === 'subscribed' ? 'Confirmed' : s.status === 'pending' ? 'Unconfirmed' : 'Unsubscribed'}</td>
                  <td>{when(s.createdAt)}</td>
                  <td>
                    <button
                      className="link-button"
                      onClick={() => {
                        if (confirm(`Delete ${s.email} for good?`)) run(async () => {
                          await api(`/api/admin/newsletter/subscribers/${s.id}`, { method: 'DELETE' });
                          await Promise.all([loadSubs(), loadOverview()]);
                        });
                      }}
                    >
                      Delete<span className="sr-only"> {s.email}</span>
                    </button>
                  </td>
                </tr>
              ))}
              {subs && subs.length === 0 && (
                <tr>
                  <td colSpan={4}>No subscribers match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
