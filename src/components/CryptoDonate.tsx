'use client';

import { useId, useState } from 'react';

const PRESETS = [5, 10, 25, 50];

/** Free-amount crypto payment: pick or type a USD amount, then continue to the BTCPay checkout. */
export function CryptoDonate({ min, max }: { min: number; max: number }) {
  const id = useId();
  const [amount, setAmount] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(amount);
  const valid = Number.isFinite(value) && value >= min && value <= max;

  return (
    <form
      className="crypto-donate"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) {
          setError(`Enter an amount between $${min} and $${max.toLocaleString('en-US')}.`);
          return;
        }
        setBusy(true);
        setError(null);
        const res = await fetch('/api/crypto/donate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: value }) }).catch(() => null);
        const data = (res ? await res.json().catch(() => ({})) : {}) as { url?: string; error?: string };
        if (res?.ok && data.url) window.location.assign(data.url);
        else {
          setError(data.error || 'Could not start the payment. Try again.');
          setBusy(false);
        }
      }}
    >
      <fieldset className="crypto-donate__presets">
        <legend className="sr-only">Pick an amount in US dollars</legend>
        {PRESETS.map((p) => (
          <button key={p} type="button" className={Number(amount) === p ? 'button' : 'button button--ghost'} aria-pressed={Number(amount) === p} onClick={() => setAmount(String(p))}>
            ${p}
          </button>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor={`${id}-amount`}>Any amount, in US dollars</label>
        <input id={`${id}-amount`} type="number" inputMode="decimal" min={min} max={max} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <p className="hint">
        Pay in Monero, Bitcoin or Lightning on the next page. No name, email or account is asked for, and the payment goes into the treasury with no payer details.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy ? 'Opening checkout…' : valid ? `Pay $${value} with crypto` : 'Pay with crypto'}
      </button>
    </form>
  );
}
