import 'server-only';
import { NATURE_SUFFIXES, getAllPosts, isGazetteSlug, type GhostPost } from './ghost';

export type GazetteItem = { base: GhostPost; shown: GhostPost; hasNature: boolean };

/** Gazette posts (not constitution/finance/nature entries), each paired with its nature edition when nature mode is on. */
export async function getGazette(nature: boolean): Promise<GazetteItem[]> {
  const all = await getAllPosts();
  const bySlug = new Map(all.map((p) => [p.slug, p]));
  return all
    .filter((p) => isGazetteSlug(p.slug))
    .map((base) => {
      const edition = NATURE_SUFFIXES.map((s) => bySlug.get(`${base.slug}${s}`)).find(Boolean);
      return { base, shown: nature && edition ? edition : base, hasNature: Boolean(edition) };
    });
}
