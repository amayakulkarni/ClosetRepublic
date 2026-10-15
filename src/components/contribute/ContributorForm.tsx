'use client';

import { useId, useState } from 'react';
import type { ContributionArea } from '@/lib/contribution-areas';

// Contact details and a public link only. There is deliberately no upload and no
// free-text field, so nobody sends private work or ideas through the site.

export function ContributorForm({ area, work }: { area: ContributionArea; work: string }) {
  const id = useId();
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'done' | 'error'; message?: string }>({ kind: 'idle' });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setState({ kind: 'busy' });
    const res = await fetch('/api/contribute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        area,
        name: f.get('name'),
        pronouns: f.get('pronouns'),
        email: f.get('email'),
        portfolioUrl: f.get('portfolioUrl'),
        agree: f.get('agree') === 'on',
        website: f.get('website'),
      }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) {
      form.reset();
      setState({ kind: 'done', message: body.duplicate ? 'We already have your details for this. Thank you!' : 'Thank you! We will check your link and get back to you by email.' });
    } else {
      setState({ kind: 'error', message: body.error || 'Something went wrong. Please try again.' });
    }
  }

  return (
    <form className="contributor-form" onSubmit={onSubmit}>
      <div className="field-grid">
        <div className="field">
          <label htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} name="name" required maxLength={100} autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-pronouns`}>
            Pronouns <span className="hint">(optional)</span>
          </label>
          <input id={`${id}-pronouns`} name="pronouns" maxLength={40} placeholder="e.g. they/them" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-email`}>Email</label>
          <input id={`${id}-email`} name="email" type="email" required maxLength={200} autoComplete="email" />
        </div>
        <div className="field field--wide">
          <label htmlFor={`${id}-link`}>Public portfolio link</label>
          <input
            id={`${id}-link`}
            name="portfolioUrl"
            type="url"
            required
            maxLength={500}
            placeholder="https://"
            aria-describedby={`${id}-link-hint`}
          />
          <span className="hint" id={`${id}-link-hint`}>
            Anywhere your {work} is already public: a Reddit post, an Instagram page or post, a blog, a website.
          </span>
        </div>
      </div>
      {/* Honeypot for bots: hidden from people and screen readers. */}
      <div className="hp" aria-hidden="true">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="check">
        <input type="checkbox" name="agree" required />
        <span>
          The link shows {work} I made or commissioned, it is already public, and I understand it will be verified. I will share ideas in the
          public community, not privately. I am 16 or older and agree to Closet Republic keeping these details as described in the{' '}
          <a href="/privacy" target="_blank" rel="noopener">Privacy Policy<span className="sr-only"> (opens in a new tab)</span></a>.
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
        {state.kind === 'busy' ? 'Sending…' : 'Send my details'}
      </button>
    </form>
  );
}
