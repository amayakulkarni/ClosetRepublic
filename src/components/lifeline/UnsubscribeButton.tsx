'use client';

import { useState } from 'react';

export function UnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  if (state === 'done')
    return (
      <p className="notice" role="status">
        Done. You have left the Lifeline. You can <a href="/lifeline">join again</a> at any time.
      </p>
    );
  return (
    <>
      {state === 'error' && (
        <p className="form-error" role="alert">
          That did not work. Please try again, or reply &ldquo;unsubscribe&rdquo; to any Lifeline email.
        </p>
      )}
      <button
        className="button"
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          const res = await fetch(`/api/lifeline/unsubscribe?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => null);
          setState(res?.ok ? 'done' : 'error');
        }}
      >
        Leave the Lifeline
      </button>
    </>
  );
}
