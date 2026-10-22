import 'server-only';
import crypto from 'node:crypto';
import { db } from './db';
import { CURRENCY, addEntry, getSettings, toMinor } from './funds';
import { rateFor } from './exchange';
import { SITE_URL } from './site-url';

// Crypto memberships through a self-hosted BTCPay Server (deploy/btcpay).
//  1. A signed-in member picks a class and 1, 3 or 12 months (POST /api/crypto/order).
//  2. The site stores an order (random token -> Discord ID, class, months) and asks BTCPay for an
//     invoice that carries only the token. No name or email is requested or stored.
//  3. BTCPay calls /api/webhooks/btcpay when the invoice settles. The site verifies the signature,
//     re-reads the invoice from BTCPay, grants the class (discord_grants, the same table that
//     /membership grant uses), records the amount in the treasury and deletes the order.

const URL_BASE = (process.env.BTCPAY_URL || '').replace(/\/$/, '');
const STORE_ID = process.env.BTCPAY_STORE_ID || '';
const API_KEY = process.env.BTCPAY_API_KEY || '';
const WEBHOOK_SECRET = process.env.BTCPAY_WEBHOOK_SECRET || '';

export const btcpayConfigured = () => Boolean(URL_BASE && STORE_ID && API_KEY && WEBHOOK_SECRET);

/**
 * Classes sold for crypto, priced in USD per month. Slugs match config/discord-tiers.json.
 * yearUsd: a flat price for 12 months. Alien is the $1 entry class on every payment rail, so it costs
 * $1 for a month and $1 for a year, the same as its two Buy Me a Coffee levels.
 */
export const CRYPTO_TIERS = [
  { slug: 'alien', name: 'Alien', usd: 1, yearUsd: 1 },
  { slug: 'citizen', name: 'Citizen', usd: 3, yearUsd: null },
  { slug: 'top-1', name: 'Top 1%', usd: 5, yearUsd: null },
  { slug: 'upper-middle-class', name: 'Upper Middle Class', usd: 6, yearUsd: null },
  { slug: 'middle-class', name: 'Middle Class', usd: 8, yearUsd: null },
] as const;
/** What a class costs for a number of months. */
export const cryptoPrice = (tier: { usd: number; yearUsd: number | null }, months: number) => (months === 12 && tier.yearUsd != null ? tier.yearUsd : tier.usd * months);
export const CRYPTO_MONTHS = [1, 3, 12] as const;
/** Free-amount crypto donations, in USD (BTCPay prices USD reliably). */
export const DONATION_MIN_USD = 1;
export const DONATION_MAX_USD = 10_000;


type Invoice = { id: string; status: string; amount: string; currency: string; metadata?: { orderId?: string; kind?: string } };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${URL_BASE}/api/v1/stores/${STORE_ID}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `token ${API_KEY}`, ...init.headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`BTCPay ${res.status}`);
  return (await res.json()) as T;
}

/** Creates the order and its invoice. Returns the BTCPay checkout page to send the member to. */
export async function createCryptoOrder(discordId: string, tierSlug: string, months: number) {
  const tier = CRYPTO_TIERS.find((t) => t.slug === tierSlug);
  if (!tier || !(CRYPTO_MONTHS as readonly number[]).includes(months)) throw new Error('Unknown class or length');
  const amount = cryptoPrice(tier, months);
  const token = crypto.randomBytes(16).toString('hex');
  const conn = db();
  // One open order per member keeps the table small.
  conn.prepare('DELETE FROM crypto_orders WHERE discord_id = ? AND invoice_id IS NULL OR (discord_id = ? AND created_at < ?)').run(discordId, discordId, new Date(Date.now() - 2 * 3600_000).toISOString());
  conn
    .prepare('INSERT INTO crypto_orders (token, discord_id, tier, months, amount_usd, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(token, discordId, tier.slug, months, amount, new Date().toISOString());
  try {
    const invoice = await api<{ id: string; checkoutLink: string }>('/invoices', {
      method: 'POST',
      body: JSON.stringify({
        amount: amount.toFixed(2),
        currency: 'USD',
        metadata: { orderId: token, itemDesc: `Closet Republic ${tier.name}, ${months} ${months === 1 ? 'month' : 'months'}` },
        checkout: { redirectURL: `${SITE_URL}/discord/link?paid=1`, redirectAutomatically: false, expirationMinutes: 30 },
      }),
    });
    conn.prepare('UPDATE crypto_orders SET invoice_id = ? WHERE token = ?').run(invoice.id, token);
    return invoice.checkoutLink;
  } catch (err) {
    conn.prepare('DELETE FROM crypto_orders WHERE token = ?').run(token);
    throw err;
  }
}

/**
 * Creates a donation invoice for any amount. Nothing about the donor is asked for or stored: the invoice
 * carries only a "donation" marker, and the webhook adds the settled amount to the treasury.
 */
export async function createCryptoDonation(amountUsd: number) {
  if (!Number.isFinite(amountUsd) || amountUsd < DONATION_MIN_USD || amountUsd > DONATION_MAX_USD) throw new Error('Amount out of range');
  const invoice = await api<{ id: string; checkoutLink: string }>('/invoices', {
    method: 'POST',
    body: JSON.stringify({
      amount: (Math.round(amountUsd * 100) / 100).toFixed(2),
      currency: 'USD',
      metadata: { kind: 'donation', itemDesc: 'Pay to keep Closet Republic free' },
      checkout: { redirectURL: `${SITE_URL}/funding?thanks=crypto`, redirectAutomatically: false, expirationMinutes: 30 },
    }),
  });
  return invoice.checkoutLink;
}

/** True when `signature` ("sha256=<hex>") matches the HMAC-SHA256 of the raw body. */
export function validSignature(raw: string, signature: string | null) {
  if (!WEBHOOK_SECRET || !signature) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex')}`);
  const given = Buffer.from(signature);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export type Fulfilment = { result: 'granted' | 'donated' | 'duplicate' | 'not-settled' | 'no-order'; discordId?: string };

/** Re-reads the invoice from BTCPay (never trusts the webhook body) and grants the class once. */
export async function fulfilInvoice(invoiceId: string): Promise<Fulfilment> {
  const invoice = await api<Invoice>(`/invoices/${encodeURIComponent(invoiceId)}`);
  if (invoice.status !== 'Settled') return { result: 'not-settled' };
  const conn = db();
  if (invoice.metadata?.kind === 'donation') return recordDonation(invoice);
  const order = conn.prepare('SELECT * FROM crypto_orders WHERE invoice_id = ?').get(invoice.id) as
    | { token: string; discord_id: string; tier: string; months: number; amount_usd: number }
    | undefined;
  const run = conn.transaction((): Fulfilment => {
    const seen = conn.prepare('SELECT 1 FROM crypto_payments WHERE invoice_id = ?').get(invoice.id);
    if (seen) return { result: 'duplicate' };
    conn.prepare('INSERT INTO crypto_payments (invoice_id, created_at) VALUES (?, ?)').run(invoice.id, new Date().toISOString());
    if (!order || invoice.metadata?.orderId !== order.token || Number(invoice.amount) < order.amount_usd) return { result: 'no-order' };
    // Extend from the end of the current crypto grant for this class, if one is still running.
    const current = conn
      .prepare("SELECT MAX(expires_at) AS e FROM discord_grants WHERE discord_id = ? AND tier = ? AND granted_by = 'crypto'")
      .get(order.discord_id, order.tier) as { e: string | null };
    const start = new Date(Math.max(Date.now(), current.e ? Date.parse(current.e) : 0));
    start.setUTCMonth(start.getUTCMonth() + order.months);
    conn
      .prepare("INSERT INTO discord_grants (discord_id, tier, expires_at, granted_by, created_at) VALUES (?, ?, ?, 'crypto', ?)")
      .run(order.discord_id, order.tier, start.toISOString(), new Date().toISOString());
    conn.prepare('DELETE FROM crypto_orders WHERE token = ?').run(order.token);
    const rate = rateFor('USD');
    addEntry({
      fund: getSettings().donationFund,
      kind: 'donation',
      amountMinor: toMinor(Number(invoice.amount) * (rate ?? 1)),
      source: 'crypto',
      externalId: `btcpay:${invoice.id}`,
      originalAmount: Number(invoice.amount),
      originalCurrency: 'USD',
      note: rate === null ? `not converted: add USD to EXCHANGE_RATES (funding currency ${CURRENCY})` : 'Crypto membership',
    });
    return { result: 'granted', discordId: order.discord_id };
  });
  return run();
}


/** A settled donation invoice: one treasury entry, once, with no donor details. */
function recordDonation(invoice: Invoice): Fulfilment {
  const conn = db();
  return conn.transaction((): Fulfilment => {
    if (conn.prepare('SELECT 1 FROM crypto_payments WHERE invoice_id = ?').get(invoice.id)) return { result: 'duplicate' };
    const amount = Number(invoice.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { result: 'no-order' };
    conn.prepare('INSERT INTO crypto_payments (invoice_id, created_at) VALUES (?, ?)').run(invoice.id, new Date().toISOString());
    const rate = rateFor(invoice.currency);
    addEntry({
      fund: getSettings().donationFund,
      kind: 'donation',
      amountMinor: toMinor(amount * (rate ?? 1)),
      source: 'crypto',
      externalId: `btcpay:${invoice.id}`,
      originalAmount: amount,
      originalCurrency: invoice.currency,
      note: rate === null ? `not converted: add ${invoice.currency} to EXCHANGE_RATES (funding currency ${CURRENCY})` : 'Crypto payment',
    });
    return { result: 'donated' };
  })();
}
