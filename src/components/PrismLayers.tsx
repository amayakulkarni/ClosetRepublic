'use client';

import { useEffect, useRef } from 'react';
import { MONO_DESCRIPTION, PRISM_DESCRIPTION, useNature } from './NatureProvider';

// The prism theme: two curved spectrum bands fixed to the top and bottom of the screen,
// plus a spectrum circle that follows the pointer. All three use mix-blend-mode: multiply,
// so white splits into the full spectrum, other colours keep only their own components,
// and black stays black.
export function PrismLayers() {
  const { on } = useNature();
  const cursor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!on) return;
    const el = cursor.current;
    if (!el) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      frame = 0;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      el.dataset.active = 'true';
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const hide = () => (el.dataset.active = 'false');
    const up = (e: PointerEvent) => e.pointerType === 'touch' && hide();
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', move, { passive: true });
    window.addEventListener('pointerup', up, { passive: true });
    document.documentElement.addEventListener('pointerleave', hide);
    window.addEventListener('blur', hide);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', move);
      window.removeEventListener('pointerup', up);
      document.documentElement.removeEventListener('pointerleave', hide);
      window.removeEventListener('blur', hide);
    };
  }, [on]);

  return (
    <>
      <p className="sr-only" id="visual-mode-description">
        {on ? PRISM_DESCRIPTION : MONO_DESCRIPTION}
      </p>
      {on && (
        <div aria-hidden="true">
          <div className="prism prism--top" />
          <div className="prism prism--bottom" />
          <div className="prism-cursor" ref={cursor} data-active="false" />
        </div>
      )}
    </>
  );
}
