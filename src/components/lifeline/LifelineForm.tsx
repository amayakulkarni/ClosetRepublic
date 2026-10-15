'use client';

import { useId, useState } from 'react';

export function LifelineForm({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'done' | 'error'; message?: string }>({ kind: 'idle' });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setState({ kind: 'busy' });
    const res = await fetch('/api/lifeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: f.get('email'), name: f.get('name'), agree: f.get('agree') === 'on', website: f.get('website') }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) {
      form.reset();
      setState({ kind: 'done', message: 'You are on the Lifeline. If the site is ever taken down, we will email you where to find us.' });
    } else {
      setState({ kind: 'error', message: body.error || 'Something went wrong. Please try again.' });
    }
  }

  return (
    <form className="lifeline-form" data-compact={compact} onSubmit={onSubmit}>
      <div className="field-grid">
        <div className="field">
          <label htmlFor={`${id}-email`}>Email</label>
          <input id={`${id}-email`} name="email" type="email" required maxLength={200} autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-name`}>
            Name <span className="hint">(optional)</span>
          </label>
          <input id={`${id}-name`} name="name" maxLength={100} autoComplete="nickname" />
        </div>
      </div>
      <div className="hp" aria-hidden="true">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="check">
        <input type="checkbox" name="agree" required />
        <span>
          Email me if Closet Republic moves, with the new address, GitHub and donation links. I am 16 or older, I agree to Closet Republic
          keeping my email as described in the <a href="/privacy" target="_blank" rel="noopener">Privacy Policy<span className="sr-only"> (opens in a new tab)</span></a>, and I can leave at any time.
        </span>
      </label>
      <p className="sr-only" role="status" aria-live="polite">
        {state.kind === 'done' ? state.message : ''}
      </p>
      {state.kind === 'error' && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}
      {state.kind === 'done' && <p className="notice">{state.message}</p>}
      <button className="button" disabled={state.kind === 'busy'}>
        {state.kind === 'busy' ? 'Joining…' : 'Join the Lifeline'}
      </button>
    </form>
  );
}
