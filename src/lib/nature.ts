import 'server-only';
import { cookies, headers } from 'next/headers';
import { NATURE_COOKIE, NATURE_FORCED_HEADER, NATURE_HEADER } from './nature-shared';

export type NatureState = {
  /** Nature mode is on for this request. */
  on: boolean;
  /** The page was opened through a ".../nature" URL, which always shows the nature edition. */
  forcedByPath: boolean;
};

export async function getNature(): Promise<NatureState> {
  const h = await headers();
  const forcedByPath = h.get(NATURE_FORCED_HEADER) === '1';
  if (forcedByPath) return { on: true, forcedByPath };
  const fromQuery = h.get(NATURE_HEADER);
  if (fromQuery) return { on: fromQuery === '1', forcedByPath };
  const c = await cookies();
  // Nature mode is the default: only an explicit "off" turns it off.
  return { on: c.get(NATURE_COOKIE)?.value !== '0', forcedByPath };
}
