'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NATURE_COOKIE, NATURE_PATH_SUFFIXES, NATURE_QUERY_NAMES } from '@/lib/nature-shared';

type NatureContextValue = {
  on: boolean;
  forcedByPath: boolean;
  setNature: (next: boolean) => void;
  toggle: () => void;
};

const NatureContext = createContext<NatureContextValue | null>(null);

export const PRISM_DESCRIPTION =
  'Nature mode is on. The page looks as if it is seen through a curved prism: near the top and bottom of the screen, and in a circle around your pointer, white softly melts into pastel rainbow colours and other colours take on a gentle tint of their own spectrum. Content in the middle of the screen is not distorted.';
export const MONO_DESCRIPTION = 'Nature mode is off. The page is shown in plain monochrome black and white.';

const SWIPE_MIN_X = 90;
const SWIPE_MAX_Y = 60;
const SWIPE_MAX_MS = 700;

export function NatureProvider({ initialOn, children }: { initialOn: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const forcedSuffix = NATURE_PATH_SUFFIXES.find((s) => pathname === s || pathname.endsWith(s));
  const forcedByPath = Boolean(forcedSuffix);
  const [chosen, setChosen] = useState(initialOn);
  const [announcement, setAnnouncement] = useState('');
  const on = forcedByPath || chosen;

  useEffect(() => {
    document.documentElement.dataset.nature = on ? 'on' : 'off';
  }, [on]);

  const setNature = useCallback(
    (next: boolean) => {
      document.cookie = `${NATURE_COOKIE}=${next ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
      setChosen(next);
      setAnnouncement(next ? PRISM_DESCRIPTION : MONO_DESCRIPTION);

      if (forcedByPath && !next) {
        router.push(pathname.slice(0, -forcedSuffix!.length) || '/');
        return;
      }
      // Drop a ?nature= query so it does not override the new choice, then re-render server content.
      const params = new URLSearchParams(window.location.search);
      if (NATURE_QUERY_NAMES.some((n) => params.has(n))) {
        NATURE_QUERY_NAMES.forEach((n) => params.delete(n));
        const qs = params.toString();
        router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
      } else {
        router.refresh();
      }
    },
    [forcedByPath, forcedSuffix, pathname, router],
  );

  const onRef = useRef(on);
  onRef.current = on;
  const toggle = useCallback(() => setNature(!onRef.current), [setNature]);

  // A quick horizontal swipe anywhere on the page toggles nature mode.
  useEffect(() => {
    let start: { x: number; y: number; t: number } | null = null;
    const ignore = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      if (target.closest('input, textarea, select, [contenteditable], [data-no-swipe]')) return true;
      for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'visible') return true;
      }
      return false;
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || ignore(e.target)) return void (start = null);
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) >= SWIPE_MIN_X && Math.abs(dy) <= SWIPE_MAX_Y && Date.now() - start.t <= SWIPE_MAX_MS) toggle();
      start = null;
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [toggle]);

  return (
    <NatureContext.Provider value={{ on, forcedByPath, setNature, toggle }}>
      {children}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </NatureContext.Provider>
  );
}

export function useNature() {
  const ctx = useContext(NatureContext);
  if (!ctx) throw new Error('useNature must be used inside NatureProvider');
  return ctx;
}
