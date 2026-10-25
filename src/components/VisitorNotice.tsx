'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const KEY = 'cr_visitor_notice';
const RETURN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

type Kind = 'first' | 'returning';
type Stored = { last: number; ack: number | null; kind: Kind };

function read(): Stored | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || 'null') as Partial<Stored> | null;
    if (raw && typeof raw.last === 'number') return { last: raw.last, ack: typeof raw.ack === 'number' ? raw.ack : null, kind: raw.kind === 'returning' ? 'returning' : 'first' };
  } catch {}
  return null;
}

function write(rec: Stored) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rec));
  } catch {}
}

/**
 * A short, plain-language notice for first-time visitors and for visitors who come back after about a week:
 * what Closet Republic is and is not. Dismissing it is remembered in this browser only (localStorage, no cookie,
 * nothing sent to the server). It sits at the bottom of the page, never blocks it, and is a banner, not a pop-up.
 */
export function VisitorNotice() {
  const [state, setState] = useState<'hidden' | Kind>('hidden');

  useEffect(() => {
    const now = Date.now();
    const rec = read();
    if (!rec || rec.ack == null) {
      // First visit, or the notice was never dismissed: keep showing it, worded the same, until it is.
      const kind = rec?.kind ?? 'first';
      setState(kind);
      write({ last: now, ack: null, kind });
    } else if (now - rec.last >= RETURN_AFTER_MS) {
      setState('returning');
      write({ last: now, ack: null, kind: 'returning' });
    } else {
      write({ last: now, ack: rec.ack, kind: rec.kind });
    }
  }, []);

  const dismiss = () => {
    write({ last: Date.now(), ack: Date.now(), kind: state === 'returning' ? 'returning' : 'first' });
    setState('hidden');
  };

  useEffect(() => {
    if (state === 'hidden') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state]);

  if (state === 'hidden') return null;
  return (
    <aside className="notice visitor-notice" role="region" aria-labelledby="visitor-notice-title">
      <div className="visitor-notice__body">
        <h2 id="visitor-notice-title">{state === 'first' ? 'Welcome to Closet Republic' : 'Welcome back to Closet Republic'}</h2>
        <p>
          Closet Republic is a parody online country: a playful community for people who once hid who they are. It is not a real country or government. It is not
          a trick: no phishing and no social engineering. It never asks for your password, card details or a government ID, and it collects no more than the{' '}
          <Link href="/privacy">Privacy Policy</Link> says. Passports here are souvenirs, not ID. Payments are voluntary support, not taxes. More in{' '}
          <Link href="/about">About</Link> and the <Link href="/terms">Terms</Link>.
        </p>
      </div>
      <button type="button" className="button button--ghost visitor-notice__close" onClick={dismiss} aria-label="Dismiss this notice (Escape also works)">
        Got it
      </button>
    </aside>
  );
}
