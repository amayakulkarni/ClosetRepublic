'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  name: string;
  linkedEmail: string | null;
  membership: { level: string | null; status: string; paidUntil: string | null } | null;
  tierName: string | null;
  tierState: string | null;
  donateUrl: string;
};

const STATUS: Record<string, string> = {
  active: 'active',
  cancelling: 'cancelled, runs until the end of the paid period',
  paused: 'paused',
  ended: 'ended',
  lapsed: 'ended',
};

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  return { ok: Boolean(res?.ok), data: data as { error?: string; hasMembership?: boolean } };
}

export function DiscordLinkForm({ name, linkedEmail, membership, tierName, tierState, donateUrl }: Props) {
  const id = useId();
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    await fn();
    setBusy(false);
  };

  const signOut = () => run(async () => {
    await post('/api/discord/link/signout');
    router.refresh();
  });

  const status = (
    <p className="sr-only" role="status" aria-live="polite">
      {message?.text}
    </p>
  );
  const shown = message && (
    <p className={message.tone === 'error' ? 'form-error' : 'notice'} role={message.tone === 'error' ? 'alert' : undefined}>
      {message.text}
    </p>
  );

  if (linkedEmail) {
    return (
      <div className="discord-link__card">
        <p>
          Signed in as <strong>{name}</strong>. This Discord account is linked to <strong>{linkedEmail}</strong>.
        </p>
        {membership ? (
          <p>
            Membership: <strong>{membership.level || 'Buy Me a Coffee member'}</strong>, {STATUS[membership.status] || membership.status}
            {membership.paidUntil && membership.status !== 'active' ? ` (paid until ${new Date(membership.paidUntil).toLocaleDateString('en-GB', { dateStyle: 'long' })})` : ''}.
          </p>
        ) : (
          <p>
            We don’t see a membership for this email yet. {donateUrl && <a href={donateUrl}>Choose a class on Buy Me a Coffee</a>}
            {donateUrl && ' and '}your role appears once it starts.
          </p>
        )}
        <p>
          Discord class:{' '}
          <strong>{tierName ? `${tierName}${tierState === 'grace' ? ' (grace period)' : ''}` : 'none yet'}</strong>
          {!tierName && membership && ' (it can take a minute; reload this page)'}
        </p>
        {status}
        {shown}
        <p className="hero__actions">
          <button
            className="button button--ghost"
            disabled={busy}
            onClick={() =>
              confirm('Unlink this email? Your class stays for a 7-day grace period, then it is removed.') &&
              run(async () => {
                const r = await post('/api/discord/link/unlink');
                if (r.ok) router.refresh();
                else setMessage({ tone: 'error', text: r.data.error || 'Could not unlink. Try again.' });
              })
            }
          >
            Unlink email
          </button>
          <button className="button button--ghost" disabled={busy} onClick={signOut}>
            Sign out
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="discord-link__card">
      <p>
        Signed in with Discord as <strong>{name}</strong>.{' '}
        <button className="link-button" onClick={signOut} disabled={busy}>
          Not you?
        </button>
      </p>
      {step === 'email' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              const r = await post('/api/discord/link/code', { email, website: f.get('website') });
              if (r.ok) {
                setStep('code');
                setMessage({ tone: 'ok', text: `We emailed a 6-digit code to ${email}. It works for 15 minutes.` });
              } else setMessage({ tone: 'error', text: r.data.error || 'Could not send the code. Try again.' });
            });
          }}
        >
          <div className="field">
            <label htmlFor={`${id}-email`}>Email you use on Buy Me a Coffee</label>
            <input id={`${id}-email`} type="email" required maxLength={200} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="hp" aria-hidden="true">
            <label htmlFor={`${id}-website`}>Website</label>
            <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
          </div>
          <p className="hint">
            We keep only your Discord ID and this email, to match your membership. See the <a href="/privacy">Privacy Policy</a>.
          </p>
          {status}
          {shown}
          <button className="button" disabled={busy}>
            {busy ? 'Sending…' : 'Email me a code'}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              const r = await post('/api/discord/link/verify', { code: f.get('code') });
              if (r.ok) router.refresh();
              else setMessage({ tone: 'error', text: r.data.error || 'Could not check the code. Try again.' });
            });
          }}
        >
          <div className="field">
            <label htmlFor={`${id}-code`}>6-digit code</label>
            <input id={`${id}-code`} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required />
          </div>
          {status}
          {shown}
          <p className="hero__actions">
            <button className="button" disabled={busy}>
              {busy ? 'Checking…' : 'Link my accounts'}
            </button>
            <button type="button" className="button button--ghost" disabled={busy} onClick={() => (setStep('email'), setMessage(null))}>
              Use a different email
            </button>
          </p>
        </form>
      )}
    </div>
  );
}
