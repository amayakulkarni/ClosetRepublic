import type { MetadataRoute } from 'next';
import { getAllPosts, getAuthors, getEntriesWithPrefix, isGazetteSlug, NATURE_SUFFIXES } from '@/lib/ghost';
import { SITE_URL } from '@/lib/site-url';

// Served at /sitemap.xml: the fixed pages plus everything published in Ghost (gazette posts,
// constitution sections, lawmakers). Rebuilt at most every 30 minutes, like the Ghost cache.
// Nature editions (/…/nature) show the same pages in the other mode, so they are left out.
export const revalidate = 1800;

const STATIC_PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '/', priority: 1, changeFrequency: 'daily' },
  { path: '/gazette', priority: 0.9, changeFrequency: 'daily' },
  { path: '/constitution', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/funding', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/lawmakers', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/timeline', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/passport', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/lifeline', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/development', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/development/constitution', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/development/writing', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/development/art', priority: 0.4, changeFrequency: 'monthly' },
];

const url = (path: string) => `${SITE_URL}${path}`;

/** Logs and skips a Ghost section that fails, so the rest of the sitemap still works. */
async function attempt<T>(what: string, fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (err) {
    console.error(`sitemap: could not list ${what}`, err);
    return [];
  }
}

/** constitution-1-2 → /constitution/1/2; skips -details entries and nature editions. */
function constitutionPath(slug: string) {
  if (NATURE_SUFFIXES.some((s) => slug.endsWith(s))) return null;
  const parts = slug.split('-').slice(1);
  if (!parts.length || !parts.every((p) => /^\d+$/.test(p))) return null;
  return `/constitution/${parts.join('/')}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, sections, authors] = await Promise.all([
    attempt('gazette posts', getAllPosts),
    attempt('constitution sections', () => getEntriesWithPrefix('constitution-')),
    attempt('lawmakers', getAuthors),
  ]);

  const entries: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({ url: url(p.path), changeFrequency: p.changeFrequency, priority: p.priority }));

  for (const post of posts) {
    if (!isGazetteSlug(post.slug)) continue;
    entries.push({
      url: url(`/gazette/${encodeURIComponent(post.slug)}`),
      lastModified: post.published_at ? new Date(post.published_at) : undefined,
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  const seen = new Set<string>();
  for (const section of sections) {
    const path = constitutionPath(section.slug);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    entries.push({ url: url(path), changeFrequency: 'monthly', priority: 0.6 });
  }

  for (const author of authors) {
    entries.push({ url: url(`/lawmakers/${encodeURIComponent(author.slug)}`), changeFrequency: 'monthly', priority: 0.5 });
  }

  return entries;
}
