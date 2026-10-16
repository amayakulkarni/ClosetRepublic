'use client';

import Link from 'next/link';
import { useId, useState } from 'react';

type Props = { frequency: string; promoPrice: string };

/** Subscribe box. After a successful sign-up it turns into a pitch for the paid Discord server. */
export function NewsletterForm({ frequency, promoPrice }: Props) {
  const id = useId();
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'done' | 'error'; message?: string }>({ kind: 'idle' });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState({ kind: 'busy' });
    const res = await fetch('/api/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: f.get('email'), website: f.get('website') }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) setState({ kind: 'done' });
    else setState({ kind: 'error', message: body.error || 'Something went wrong. Please try again.' });
  }

  if (state.kind === 'done') {
    return (
      <section className="newsletter newsletter--done" aria-labelledby={`${id}-title`}>
        <p className="newsletter__thanks" role="status">
          Almost there: check your inbox for an email from us and click the link in it to confirm your subscription.
        </p>
        <h2 id={`${id}-title`}>Love role-play? Join our paid Discord server</h2>
        <p>
          Take your seat as a citizen of the Republic in our role-playing Discord server. Memberships start at {promoPrice}, and a class never buys
          votes or moderator powers.
        </p>
        <p className="newsletter__actions">
          <Link className="button" href="/funding#membership">
            See the memberships
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="newsletter" id="newsletter" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Subscribe to our free, highly enlightening {frequency} newsletter</h2>
      <form className="newsletter__form" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor={`${id}-email`}>
          Email address
        </label>
        <input id={`${id}-email`} name="email" type="email" required maxLength={200} autoComplete="email" placeholder="you@example.com" />
        <div className="hp" aria-hidden="true">
          <label htmlFor={`${id}-website`}>Website</label>
          <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <button className="button" disabled={state.kind === 'busy'}>
          {state.kind === 'busy' ? 'Subscribing…' : 'Subscribe'}
        </button>
      </form>
      {state.kind === 'error' && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}
      <p className="newsletter__legal">
        By subscribing you agree to our{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </section>
  );
}
