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
