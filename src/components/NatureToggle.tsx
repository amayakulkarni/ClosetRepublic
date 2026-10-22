'use client';

import { useEffect, useState } from 'react';
import { useNature } from './NatureProvider';

const HINT_KEY = 'cr-nature-hint';

export function NatureToggle() {
  const { on, toggle } = useNature();
  // A gentle pulse for first-time visitors only (see globals.css); the switch itself is unchanged.
  const [nudge, setNudge] = useState(false);
  const stop = () => {
    setNudge(false);
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
    const show = setTimeout(() => setNudge(true), 1500);
    const hide = setTimeout(() => setNudge(false), 9000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="nature-toggle"
      data-hint={nudge}
      onClick={() => {
        stop();
        toggle();
      }}
      title="Toggle nature mode (or swipe sideways)"
    >
      <span className="nature-toggle__track" aria-hidden="true">
        <span className="nature-toggle__thumb" />
      </span>
      <span className="nature-toggle__label">Nature</span>
    </button>
  );
}
