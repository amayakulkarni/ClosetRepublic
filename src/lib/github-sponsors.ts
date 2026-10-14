import 'server-only';
import { db } from './db';
import { rateFor } from './exchange';
import { addEntry, getSettings, monthOf, toMinor } from './funds';

// GitHub Sponsors, fed by GitHub's "sponsorship" webhook.
// GitHub only sends an event when a sponsorship starts, changes tier or ends, not for
// every monthly charge. So each active monthly sponsor gets one ledger entry per month:
// the first when they start, and later ones are added on the first treasury read of each
// new month (recordSponsorRenewals). Every entry has a stable id, so nothing is counted twice.

export type GithubSponsor = {
  id: number;
  nodeId: string;
  login: string;
  isPublic: boolean;
  tierName: string | null;
  monthlyCents: number;
  oneTime: boolean;
  status: 'active' | 'cancelled';
  startedAt: string;
};

type Row = { id: number; node_id: string; login: string; is_public: number; tier_name: string | null; monthly_cents: number; one_time: number; status: 'active' | 'cancelled'; started_at: string };
const toSponsor = (r: Row): GithubSponsor => ({
  id: r.id,
  nodeId: r.node_id,
  login: r.login,
  isPublic: r.is_public === 1,
  tierName: r.tier_name,
  monthlyCents: r.monthly_cents,
  oneTime: r.one_time === 1,
  status: r.status,
  startedAt: r.started_at,
});

export function getSponsor(nodeId: string) {
  const row = db().prepare('SELECT * FROM github_sponsors WHERE node_id = ?').get(nodeId) as Row | undefined;
  return row ? toSponsor(row) : null;
}

export function listSponsors(): GithubSponsor[] {
  return (db().prepare('SELECT * FROM github_sponsors ORDER BY started_at DESC').all() as Row[]).map(toSponsor);
}

/** Records one month's (or a one-time) payment in the treasury. Returns false if it was already there. */
function recordPayment(s: GithubSponsor, when: Date) {
  const usd = s.monthlyCents / 100;
  const rate = rateFor('USD');
  const month = monthOf(when);
  const entry = addEntry({
    fund: getSettings().donationFund,
    kind: 'donation',
    amountMinor: toMinor(usd * (rate ?? 1)),
    source: 'github',
    externalId: s.oneTime ? `gh:once:${s.nodeId}` : `gh:monthly:${s.nodeId}:${month}`,
    originalAmount: usd,
    originalCurrency: 'USD',
    supporterName: s.isPublic ? s.login : 'Private sponsor',
    note: [s.oneTime ? 'one-time' : 'monthly', s.tierName, rate === null ? 'not converted: add USD to EXCHANGE_RATES' : null]
      .filter(Boolean)
      .join(' · '),
    createdAt: when,
  });
  return entry !== null;
}

export type SponsorshipEvent = {
  action: string;
  sponsorship: {
    node_id: string;
    created_at?: string;
    privacy_level?: string;
    sponsor?: { login?: string } | null;
    tier?: { name?: string; monthly_price_in_cents?: number; is_one_time?: boolean } | null;
  };
  changes?: { tier?: { from?: unknown } };
};

/** Applies one "sponsorship" webhook event. Returns what happened, for the response and logs. */
export function applySponsorshipEvent(e: SponsorshipEvent): string {
  const sp = e.sponsorship;
  if (!sp?.node_id) return 'ignored: no sponsorship';
  const now = new Date().toISOString();
  const tier = sp.tier ?? {};
  const cents = Math.max(0, Math.round(Number(tier.monthly_price_in_cents) || 0));

  if (e.action === 'created') {
    db()
      .prepare(
        `INSERT INTO github_sponsors (node_id, login, is_public, tier_name, monthly_cents, one_time, status, started_at, updated_at)
         VALUES (@nodeId, @login, @isPublic, @tierName, @cents, @oneTime, 'active', @startedAt, @now)
         ON CONFLICT(node_id) DO UPDATE SET status = 'active', tier_name = excluded.tier_name, monthly_cents = excluded.monthly_cents,
           one_time = excluded.one_time, is_public = excluded.is_public, updated_at = excluded.updated_at`,
      )
      .run({
        nodeId: sp.node_id,
        login: sp.sponsor?.login || 'unknown',
        isPublic: sp.privacy_level === 'public' ? 1 : 0,
        tierName: tier.name ?? null,
        cents,
        oneTime: tier.is_one_time ? 1 : 0,
        startedAt: sp.created_at || now,
        now,
      });
    const s = getSponsor(sp.node_id)!;
    if (cents <= 0) return 'recorded sponsor (free tier)';
    return recordPayment(s, new Date(sp.created_at || now)) ? 'recorded payment' : 'duplicate';
  }

  if (e.action === 'tier_changed') {
    // The new price applies from the next charge, which recordSponsorRenewals picks up.
    const changed = db()
      .prepare("UPDATE github_sponsors SET tier_name = ?, monthly_cents = ?, one_time = ?, updated_at = ? WHERE node_id = ?")
      .run(tier.name ?? null, cents, tier.is_one_time ? 1 : 0, now, sp.node_id).changes;
    return changed ? 'tier updated' : 'ignored: unknown sponsor';
  }

  if (e.action === 'cancelled') {
    // GitHub sends this when the paid period ends, so this month's payment stays counted.
    const changed = db().prepare("UPDATE github_sponsors SET status = 'cancelled', updated_at = ? WHERE node_id = ?").run(now, sp.node_id).changes;
    return changed ? 'sponsor cancelled' : 'ignored: unknown sponsor';
  }

  if (e.action === 'edited') {
    db()
      .prepare('UPDATE github_sponsors SET is_public = ?, updated_at = ? WHERE node_id = ?')
      .run(sp.privacy_level === 'public' ? 1 : 0, now, sp.node_id);
    return 'privacy updated';
  }

  return `ignored: ${e.action}`; // pending_cancellation, pending_tier_change
}

/** Adds this month's payment for every active monthly sponsor who started before this month. Safe to call often. */
export function recordSponsorRenewals() {
  const month = monthOf();
  let added = 0;
  for (const s of listSponsors()) {
    if (s.status !== 'active' || s.oneTime || s.monthlyCents <= 0) continue;
    if (monthOf(new Date(s.startedAt)) >= month) continue;
    if (recordPayment(s, new Date())) added++;
  }
  return added;
}

/** Public numbers for the funding page: active monthly sponsors and the public ones' names. */
export function sponsorSummary() {
  const active = listSponsors().filter((s) => s.status === 'active' && !s.oneTime);
  return {
    count: active.length,
    monthlyUsd: active.reduce((sum, s) => sum + s.monthlyCents, 0) / 100,
    publicLogins: active.filter((s) => s.isPublic).map((s) => s.login),
  };
}
