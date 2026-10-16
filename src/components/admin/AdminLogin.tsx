'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function AdminLogin() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<{ id: string; sentTo: string } | null>(null);

  async function post(body: object) {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setError(data.error || 'Could not sign in');
      if (challenge && res?.status === 401) setChallenge(null);
      return;
    }
    if (data.step === 'code') setChallenge({ id: data.challenge, sentTo: data.sentTo });
    else router.refresh();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (challenge) await post({ challenge: challenge.id, code: String(f.get('code') || '') });
    else await post({ token: String(f.get('token') || '') });
  }

  return (
    <form className="admin-login" onSubmit={onSubmit}>
      <h1>Admin</h1>
      {challenge ? (
        <div className="field">
          <label htmlFor="code">Sign-in code</label>
          <input id="code" name="code" required autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} maxLength={12} autoFocus />
          <p className="hint">An 8-character code was emailed to {challenge.sentTo}. It works once and expires in 10 minutes.</p>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="token">Admin token</label>
          <input id="token" name="token" type="password" required autoComplete="current-password" />
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {challenge ? 'Verify code' : 'Sign in'}
      </button>
    </form>
  );
}
