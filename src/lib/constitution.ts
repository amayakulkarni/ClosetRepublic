import 'server-only';
import { countFrom, getEntriesWithPrefix, getEntry, getNatureEdition, type GhostPost } from './ghost';

// Constitution content lives in Ghost as posts or pages with these slugs:
//   constitution            → introduction shown on /constitution
//   constitution-details    → its text holds the number of sections (e.g. "5")
//   constitution-1          → /constitution/1
//   constitution-1-details  → number of sub-sections in section 1
//   constitution-1-2        → /constitution/1/2
//   <any of the above>-nature → the nature edition

export const slugFor = (path: string[]) => ['constitution', ...path].join('-');

export type SectionLink = { number: number; path: string[]; title: string | null };

/** Children of a section: 1..N from its "-details" entry, otherwise whichever numbered children exist. */
export async function getSections(path: string[]): Promise<{ count: number | null; sections: SectionLink[] }> {
  const prefix = `${slugFor(path)}-`;
  const [details, entries] = await Promise.all([getEntry(`${prefix}details`), getEntriesWithPrefix(prefix)]);
  const count = countFrom(details);
  const direct = new Map<number, GhostPost>();
  for (const e of entries) {
    const m = e.slug.slice(prefix.length).match(/^(\d+)$/);
    if (m) direct.set(Number(m[1]), e);
  }
  const numbers = count ? Array.from({ length: count }, (_, i) => i + 1) : [...direct.keys()].sort((a, b) => a - b);
  return {
    count,
    sections: numbers.map((n) => ({ number: n, path: [...path, String(n)], title: direct.get(n)?.title ?? null })),
  };
}

export async function getSection(path: string[]) {
  const slug = slugFor(path);
  const [entry, edition] = await Promise.all([getEntry(slug), getNatureEdition(slug)]);
  return { entry, edition };
}
