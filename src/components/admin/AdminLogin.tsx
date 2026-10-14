'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function AdminLogin() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const token = String(new FormData(e.currentTarget).get('token') || '');
    const res = await fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error || 'Could not sign in');
  }

  return (
    <form className="admin-login" onSubmit={onSubmit}>
      <h1>Admin</h1>
      <div className="field">
        <label htmlFor="token">Admin token</label>
        <input id="token" name="token" type="password" required autoComplete="current-password" />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        Sign in
      </button>
    </form>
  );
}
