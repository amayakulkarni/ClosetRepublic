// Shared between the proxy, server components and client components.
export const NATURE_COOKIE = 'cr_nature';
export const NATURE_HEADER = 'x-cr-nature';
export const NATURE_FORCED_HEADER = 'x-cr-nature-path';
/** Query names and URL endings that switch nature mode; "paradoy" and "parody" are the old names. */
export const NATURE_QUERY_NAMES = ['nature', 'paradoy', 'parody'];
export const NATURE_PATH_SUFFIXES = ['/nature', '/paradoy'];

/** Reads "true/false/on/off/1/0" from a query value. */
export function parseNatureValue(value: string | null): boolean | null {
  if (value == null) return null;
  const v = value.toLowerCase();
  if (['true', '1', 'on', 'yes'].includes(v)) return true;
  if (['false', '0', 'off', 'no'].includes(v)) return false;
  return null;
}
