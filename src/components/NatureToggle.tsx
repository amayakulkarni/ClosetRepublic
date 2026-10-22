'use client';

import { useEffect, useState } from 'react';
import { useNature } from './NatureProvider';

const HINT_KEY = 'cr-nature-hint';

/** The colours switch. First-time visitors get a small friendly nudge to try it, once. */
export function NatureToggle() {
  const { on, toggle } = useNature();
  const [hint, setHint] = useState(false);

  const dismiss = () => {
    setHint(false);
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {}
  };

  useEffect(() => {
    let seen = false;
    try {
      seen = Boolean(localStorage.getItem(HINT_KEY));
    } catch {}
    if (seen) return;
    const show = setTimeout(() => setHint(true), 1500);
    const hide = setTimeout(() => setHint(false), 11000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  return (
    <span className="nature-wrap">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className="nature-toggle"
        data-hint={hint}
        onClick={() => {
          dismiss();
          toggle();
        }}
        title="Nature mode: turn the colours on or off (or swipe sideways)"
      >
        <span className="nature-toggle__track" aria-hidden="true">
          <span className="nature-toggle__thumb" />
        </span>
        <span className="nature-toggle__label">Colours</span>
      </button>
      {hint && (
        <span className="nature-hint" role="status">
          Try me: tap to switch the colours on or off
        </span>
      )}
    </span>
  );
}
