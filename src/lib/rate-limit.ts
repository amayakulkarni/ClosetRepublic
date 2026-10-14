import 'server-only';

// A small in-memory limiter for public forms: a few submissions per visitor per hour
// keeps bots from filling the database. Resets when the server restarts, which is fine.

const buckets = new Map<string, Map<string, number[]>>();

export function clientIp(request: Request) {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
}

/** True when this visitor has gone over `max` hits for `name` within the window. */
export function tooMany(name: string, request: Request, max = 5, windowMs = 60 * 60 * 1000) {
  const recent = buckets.get(name) ?? new Map<string, number[]>();
  buckets.set(name, recent);
  const ip = clientIp(request);
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5000) for (const [k, v] of recent) if (v.every((t) => now - t >= windowMs)) recent.delete(k);
  return hits.length > max;
}
