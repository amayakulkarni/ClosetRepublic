import { NextResponse } from 'next/server';
import { adminRoute, BadRequest, idFrom, readJson, textFrom } from '@/lib/admin-api';
import { CONTRIBUTOR_STATUSES, type ContributorStatus } from '@/lib/contribution-areas';
import { deleteContributor, getContributor, updateContributor } from '@/lib/contributors';
import { sendStatusEmail } from '@/lib/contributor-mail';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PUT /api/admin/contributors/:id  { status?: new|verifying|verified|declined, adminNote?, notify?: boolean }
 * Changing the status to verified or declined emails the contributor unless notify is false.
 */
export const PUT = adminRoute(async (request: Request, ctx: Ctx) => {
  const id = await idFrom(ctx);
  const body = await readJson(request);
  const patch: { status?: ContributorStatus; adminNote?: string | null } = {};
  if ('status' in body) {
    if (!CONTRIBUTOR_STATUSES.includes(body.status as ContributorStatus)) throw new BadRequest('status must be new, verifying, verified or declined');
    patch.status = body.status as ContributorStatus;
  }
  if ('adminNote' in body) patch.adminNote = textFrom(body.adminNote, 'adminNote', { max: 1000 });
  const before = getContributor(id);
  const contributor = updateContributor(id, patch);
  if (!before || !contributor) return NextResponse.json({ error: 'No such contributor' }, { status: 404 });
  const changed = patch.status !== undefined && patch.status !== before.status;
  const email = changed && body.notify !== false ? await sendStatusEmail(contributor) : null;
  return NextResponse.json({ contributor, email });
});

/** DELETE /api/admin/contributors/:id  removes their details for good. */
export const DELETE = adminRoute(async (_request: Request, ctx: Ctx) => {
  if (!deleteContributor(await idFrom(ctx))) return NextResponse.json({ error: 'No such contributor' }, { status: 404 });
  return NextResponse.json({ ok: true });
});
