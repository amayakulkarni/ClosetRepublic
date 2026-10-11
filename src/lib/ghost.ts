import 'server-only';

// Thin client for the Ghost Content API.
// Docs: https://ghost.org/docs/content-api/

const GHOST_URL = (process.env.GHOST_URL || 'https://management-of.closetrepublic.com').replace(/\/$/, '');
const GHOST_KEY = process.env.GHOST_CONTENT_API_KEY || '';
const REVALIDATE_SECONDS = 30 * 60; // Ghost responses are cached for 30 minutes

// Nature editions are Ghost entries with the original slug plus "-nature" (older "-paradoy" entries still work).
export const NATURE_SUFFIXES = ['-nature', '-paradoy'];

export type GhostAuthor = {
  id: string;
  slug: string;
  name: string;
  profile_image: string | null;
  cover_image: string | null;
  bio: string | null;
  website: string | null;
  location: string | null;
  facebook: string | null;
  twitter: string | null;
  count?: { posts: number };
};

export type GhostPost = {
  id: string;
  slug: string;
  title: string;
  html?: string | null;
  plaintext?: string | null;
  excerpt?: string | null;
  custom_excerpt?: string | null;
  feature_image?: string | null;
  feature_image_alt?: string | null;
  feature_image_caption?: string | null;
  featured?: boolean;
  published_at?: string | null;
  reading_time?: number;
  authors?: GhostAuthor[];
  primary_author?: GhostAuthor | null;
};

export class GhostNotConfiguredError extends Error {
  constructor() {
    super('GHOST_CONTENT_API_KEY is not set');
  }
}

export const ghostConfigured = () => Boolean(GHOST_KEY);

async function ghostFetch<T>(resource: string, params: Record<string, string> = {}): Promise<T | null> {
  if (!GHOST_KEY) throw new GhostNotConfiguredError();
  const url = new URL(`${GHOST_URL}/ghost/api/content/${resource}`);
  url.searchParams.set('key', GHOST_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { 'Accept-Version': 'v5.0' },
    next: { revalidate: REVALIDATE_SECONDS, tags: ['ghost'] },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Ghost ${resource} responded ${res.status}`);
  return (await res.json()) as T;
}

const LIST_FIELDS = 'id,slug,title,excerpt,custom_excerpt,feature_image,feature_image_alt,featured,published_at,reading_time';

/** Every published post, newest first, without bodies. */
export async function getAllPosts(): Promise<GhostPost[]> {
  const data = await ghostFetch<{ posts: GhostPost[] }>('posts/', {
    limit: 'all',
    include: 'authors',
    fields: LIST_FIELDS,
    order: 'published_at desc',
  });
  return data?.posts ?? [];
}

async function getEntryFrom(kind: 'posts' | 'pages', slug: string): Promise<GhostPost | null> {
  const data = await ghostFetch<Record<string, GhostPost[]>>(`${kind}/slug/${encodeURIComponent(slug)}/`, {
    include: 'authors',
    formats: 'html,plaintext',
  });
  return data?.[kind]?.[0] ?? null;
}

/** A post by slug, falling back to a Ghost page with the same slug. */
export async function getEntry(slug: string): Promise<GhostPost | null> {
  return (await getEntryFrom('posts', slug)) ?? (await getEntryFrom('pages', slug));
}

/** Posts and pages whose slug starts with the given prefix. */
export async function getEntriesWithPrefix(prefix: string): Promise<GhostPost[]> {
  const params = { limit: 'all', fields: 'id,slug,title,custom_excerpt,excerpt', filter: `slug:~^'${prefix}'` };
  const [posts, pages] = await Promise.all([
    ghostFetch<{ posts: GhostPost[] }>('posts/', params),
    ghostFetch<{ pages: GhostPost[] }>('pages/', params),
  ]);
  return [...(posts?.posts ?? []), ...(pages?.pages ?? [])];
}

export async function getAuthors(): Promise<GhostAuthor[]> {
  const data = await ghostFetch<{ authors: GhostAuthor[] }>('authors/', {
    limit: 'all',
    include: 'count.posts',
    order: 'name asc',
  });
  return data?.authors ?? [];
}

export async function getAuthor(slug: string): Promise<GhostAuthor | null> {
  const data = await ghostFetch<{ authors: GhostAuthor[] }>(`authors/slug/${encodeURIComponent(slug)}/`, {
    include: 'count.posts',
  });
  return data?.authors?.[0] ?? null;
}

export async function getPostsByAuthor(slug: string): Promise<GhostPost[]> {
  const data = await ghostFetch<{ posts: GhostPost[] }>('posts/', {
    limit: 'all',
    include: 'authors',
    fields: LIST_FIELDS,
    filter: `authors:${slug}`,
  });
  return (data?.posts ?? []).filter((p) => isGazetteSlug(p.slug));
}

/** Slugs that belong to other sections and never show in the gazette list. */
export function isGazetteSlug(slug: string) {
  return !NATURE_SUFFIXES.some((s) => slug.endsWith(s)) && !slug.startsWith('constitution') && slug !== 'finance';
}

/** The nature edition of an entry, if one exists. */
export async function getNatureEdition(slug: string): Promise<GhostPost | null> {
  for (const suffix of NATURE_SUFFIXES) {
    const entry = await getEntry(`${slug}${suffix}`);
    if (entry) return entry;
  }
  return null;
}

export const excerptOf = (p: GhostPost) => p.custom_excerpt || p.excerpt || '';

/** First whole number in a Ghost entry, used by the ".../details" section counters. */
export function countFrom(entry: GhostPost | null): number | null {
  if (!entry) return null;
  const text = entry.plaintext || entry.html?.replace(/<[^>]+>/g, ' ') || entry.title;
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

/** Runs a Ghost call and turns "not configured" or network errors into a value the page can show. */
export async function safely<T>(fn: () => Promise<T>, fallback: T): Promise<{ data: T; problem: string | null }> {
  try {
    return { data: await fn(), problem: null };
  } catch (err) {
    if (err instanceof GhostNotConfiguredError) {
      return { data: fallback, problem: 'The Ghost Content API key is not set yet (GHOST_CONTENT_API_KEY).' };
    }
    console.error(err);
    return { data: fallback, problem: 'The Gazette press could not reach the Ghost backend just now.' };
  }
}
