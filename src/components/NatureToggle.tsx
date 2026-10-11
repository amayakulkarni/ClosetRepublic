'use client';

import { useNature } from './NatureProvider';

export function NatureToggle() {
  const { on, toggle } = useNature();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="nature-toggle"
      onClick={toggle}
      title="Toggle nature mode (or swipe sideways)"
    >
      <span className="nature-toggle__track" aria-hidden="true">
        <span className="nature-toggle__thumb" />
      </span>
      <span className="nature-toggle__label">Nature</span>
    </button>
  );
}
