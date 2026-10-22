'use client';

import { useId, useState } from 'react';

type Tier = { slug: string; name: string; usd: number; yearUsd: number | null };
const priceFor = (t: Tier | undefined, months: number) => (!t ? 0 : months === 12 && t.yearUsd != null ? t.yearUsd : t.usd * months);

/** Pay for a class with crypto: pick the class and length, then continue to the BTCPay checkout page. */
export function CryptoPay({ tiers, months }: { tiers: Tier[]; months: number[] }) {
  const id = useId();
  const [tier, setTier] = useState(tiers[1]?.slug ?? tiers[0].slug);
  const [length, setLength] = useState(months[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = priceFor(tiers.find((t) => t.slug === tier), length);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch('/api/crypto/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier, months: length }) }).catch(() => null);
        const data = (res ? await res.json().catch(() => ({})) : {}) as { url?: string; error?: string };
        if (res?.ok && data.url) window.location.assign(data.url);
        else {
          setError(data.error || 'Could not start the payment. Try again.');
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor={`${id}-tier`}>Class</label>
        <select id={`${id}-tier`} value={tier} onChange={(e) => setTier(e.target.value)}>
          {tiers.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}, ${t.usd} a month{t.yearUsd != null ? ` or $${t.yearUsd} a year` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-months`}>Length</label>
        <select id={`${id}-months`} value={length} onChange={(e) => setLength(Number(e.target.value))}>
          {months.map((m) => (
            <option key={m} value={m}>
              {m} {m === 1 ? 'month' : 'months'}
            </option>
          ))}
        </select>
      </div>
      <p className="hint">
        Total ${price} USD, paid in Monero, Bitcoin or Lightning on the next page. No name or email is asked for. Crypto cannot renew by itself, so the class ends when the paid time does (plus a 7-day grace period).
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy ? 'Opening checkout…' : `Pay $${price} with crypto`}
      </button>
    </form>
  );
}
