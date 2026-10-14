import 'server-only';
import { db } from './db';
import type { ContributionArea, ContributorStatus } from './contribution-areas';

// People who offered to contribute to the constitution, the writing or the artwork.
// Only contact details and a public portfolio link are kept: never the work itself.

export type Contributor = {
  id: number;
  area: ContributionArea;
  name: string;
  pronouns: string | null;
  email: string;
  portfolioUrl: string;
  status: ContributorStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: number;
  area: ContributionArea;
  name: string;
  pronouns: string | null;
  email: string;
  portfolio_url: string;
  status: ContributorStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

const toContributor = (r: Row): Contributor => ({
  id: r.id,
  area: r.area,
  name: r.name,
  pronouns: r.pronouns,
  email: r.email,
  portfolioUrl: r.portfolio_url,
  status: r.status,
  adminNote: r.admin_note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export type NewContributor = Pick<Contributor, 'area' | 'name' | 'pronouns' | 'email' | 'portfolioUrl'>;

/** Saves a sign-up. The same person sending the same link for the same area twice in a day is stored once. */
export function addContributor(c: NewContributor): { contributor: Contributor; duplicate: boolean } {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const existing = db()
    .prepare('SELECT * FROM contributors WHERE area = ? AND lower(email) = lower(?) AND portfolio_url = ? AND created_at > ? LIMIT 1')
    .get(c.area, c.email, c.portfolioUrl, since) as Row | undefined;
  if (existing) return { contributor: toContributor(existing), duplicate: true };
  const at = new Date().toISOString();
  const info = db()
    .prepare(
      `INSERT INTO contributors (area, name, pronouns, email, portfolio_url, status, created_at, updated_at)
       VALUES (@area, @name, @pronouns, @email, @portfolioUrl, 'new', @at, @at)`,
    )
    .run({ ...c, at });
  return { contributor: getContributor(Number(info.lastInsertRowid))!, duplicate: false };
}

export function getContributor(id: number): Contributor | null {
  const row = db().prepare('SELECT * FROM contributors WHERE id = ?').get(id) as Row | undefined;
  return row ? toContributor(row) : null;
}

export function listContributors(opts: { area?: ContributionArea; status?: ContributorStatus } = {}): Contributor[] {
  const where: string[] = [];
  const params: Record<string, string> = {};
  if (opts.area) {
    where.push('area = @area');
    params.area = opts.area;
  }
  if (opts.status) {
    where.push('status = @status');
    params.status = opts.status;
  }
  const sql = `SELECT * FROM contributors ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT 1000`;
  return (db().prepare(sql).all(params) as Row[]).map(toContributor);
}

export function updateContributor(id: number, patch: { status?: ContributorStatus; adminNote?: string | null }) {
  const current = getContributor(id);
  if (!current) return null;
  db()
    .prepare('UPDATE contributors SET status = @status, admin_note = @adminNote, updated_at = @at WHERE id = @id')
    .run({ id, status: patch.status ?? current.status, adminNote: patch.adminNote !== undefined ? patch.adminNote : current.adminNote, at: new Date().toISOString() });
  return getContributor(id);
}

export const deleteContributor = (id: number) => db().prepare('DELETE FROM contributors WHERE id = ?').run(id).changes > 0;

/** Counts of new sign-ups per area, for the admin tab. */
export function newCounts() {
  const rows = db().prepare("SELECT area, COUNT(*) n FROM contributors WHERE status = 'new' GROUP BY area").all() as { area: ContributionArea; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.area, r.n])) as Partial<Record<ContributionArea, number>>;
}
