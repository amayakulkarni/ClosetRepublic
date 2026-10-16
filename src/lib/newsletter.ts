import 'server-only';

// Newsletter sign-ups go through Ghost's own public sign-up endpoints, so Ghost stays the only
// place that stores subscribers and sends the issues:
//  1. The browser posts the email to /api/newsletter (this site is the middleman; Ghost is never
//     called from the browser and no Ghost key is exposed).
//  2. The site asks Ghost to email a confirmation link (the same call Ghost's own sign-up form makes).
//  3. Ghost creates the member and subscribes it only after that link is clicked (double opt-in),
//     so nobody can subscribe an address they do not own.
// Ghost needs: Settings > Membership > Access set to "Anyone can sign up", and working email delivery.

const GHOST_URL = (process.env.GHOST_URL || 'https://management-of.closetrepublic.com').replace(/\/$/, '');
// Optional: the newsletter to subscribe new members to. Empty means Ghost's default newsletters.
const NEWSLETTER_NAME = process.env.GHOST_NEWSLETTER_NAME || '';

export const newsletterEnabled = () => process.env.NEWSLETTER_DISABLED !== 'true';

/** Public settings read at request time, so changing the environment needs only a restart. */
export function newsletterSettings() {
  return {
    frequency: (process.env.NEWSLETTER_FREQUENCY || 'weekly').trim() || 'weekly',
    promoPrice: (process.env.DISCORD_PROMO_PRICE || 'INR 100 per year').trim() || 'INR 100 per year',
  };
}

export class NewsletterError extends Error {}

/** Asks Ghost to email a confirmation link to this address. Resolves when Ghost accepted the request. */
export async function requestSignup(email: string) {
  const headers = { 'Content-Type': 'application/json', 'Accept-Version': 'v5.0', 'User-Agent': 'closetrepublic.com newsletter' };
  // Ghost 5.4x and later require a short-lived integrity token; older versions have no such endpoint.
  let integrityToken: string | undefined;
  const tokenRes = await fetch(`${GHOST_URL}/members/api/integrity-token/`, { headers, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (tokenRes?.ok) integrityToken = (await tokenRes.text()).trim() || undefined;

  const res = await fetch(`${GHOST_URL}/members/api/send-magic-link/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      emailType: 'signup',
      integrityToken,
      autoRedirect: false,
      ...(NEWSLETTER_NAME ? { newsletters: [{ name: NEWSLETTER_NAME }] } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch((err: Error) => {
    throw new NewsletterError(`Ghost unreachable: ${err.message}`);
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new NewsletterError(`Ghost responded ${res.status}: ${detail}`);
  }
}
