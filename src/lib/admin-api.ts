import 'server-only';
import { NextResponse } from 'next/server';
import { isAdmin, unauthorized } from './admin-auth';

/** Wraps an admin route: checks auth, parses JSON, turns thrown BadRequest into a 400. */
export function adminRoute<C>(handler: (request: Request, ctx: C) => Promise<Response> | Response) {
  return async (request: Request, ctx: C) => {
    if (!(await isAdmin(request))) return unauthorized();
    try {
      return await handler(request, ctx);
    } catch (err) {
      if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
  };
}

export class BadRequest extends Error {}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') throw new BadRequest('Send a JSON object');
  return body as Record<string, unknown>;
}

export function amountFrom(value: unknown, field = 'amount') {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new BadRequest(`${field} must be a number`);
  return n;
}

/** A trimmed string field. Required fields throw when empty; optional ones become null. */
export function textFrom(value: unknown, field: string, { required = false, max = 2000 } = {}) {
  const s = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  if (!s) {
    if (required) throw new BadRequest(`${field} is required`);
    return null;
  }
  if (s.length > max) throw new BadRequest(`${field} is too long (max ${max} characters)`);
  return s;
}

/** A calendar date as YYYY-MM-DD. */
export function dateFrom(value: unknown, field: string, { required = false } = {}) {
  const s = textFrom(value, field, { required, max: 10 });
  if (s === null) return null;
  const parsed = new Date(`${s}T00:00:00Z`);
  // The round trip rejects dates like 2026-02-30 that JavaScript would roll over into March.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== s) throw new BadRequest(`${field} must look like 2026-10-14`);
  return s;
}

/** An optional http(s) link. Relative site links like /gazette/x are allowed too. */
export function linkFrom(value: unknown, field = 'link') {
  const s = textFrom(value, field, { max: 500 });
  if (s === null) return null;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  try {
    const u = new URL(s);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString();
  } catch {}
  throw new BadRequest(`${field} must be an https:// link or a site path like /gazette/my-post`);
}

/** Reads the numeric :id route param. */
export async function idFrom(ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequest('Bad id');
  return id;
}
