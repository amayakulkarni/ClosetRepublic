'use client';

import { useState } from 'react';

/** A single button that posts to a newsletter endpoint (confirm or unsubscribe), so link scanners cannot trigger it. */
export function NewsletterAction({ endpoint, code, label, done }: { endpoint: string; code: string; label: string; done: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  if (state === 'done')
    return (
      <p className="notice" role="status">
        {done}
      </p>
    );
  return (
    <>
      {state === 'error' && (
        <p className="form-error" role="alert">
          That did not work. Please try again.
        </p>
      )}
      <button
        className="button"
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          const res = await fetch(`${endpoint}?c=${encodeURIComponent(code)}`, { method: 'POST' }).catch(() => null);
          setState(res?.ok ? 'done' : 'error');
        }}
      >
        {label}
      </button>
    </>
  );
}
