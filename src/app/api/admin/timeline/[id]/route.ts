import { NextResponse } from 'next/server';
import { adminRoute, dateFrom, idFrom, linkFrom, readJson, textFrom } from '@/lib/admin-api';
import { deleteEvent, updateEvent, type EventInput } from '@/lib/roadmap';

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/admin/timeline/:id  any of { date, title, description, link } */
export const PUT = adminRoute(async (request: Request, ctx: Ctx) => {
  const id = await idFrom(ctx);
  const body = await readJson(request);
  const patch: Partial<EventInput> = {};
  if ('date' in body) patch.date = dateFrom(body.date, 'date', { required: true })!;
  if ('title' in body) patch.title = textFrom(body.title, 'title', { required: true, max: 200 })!;
  if ('description' in body) patch.description = textFrom(body.description, 'description');
  if ('link' in body) patch.link = linkFrom(body.link);
  const event = updateEvent(id, patch);
  if (!event) return NextResponse.json({ error: 'No such event' }, { status: 404 });
  return NextResponse.json({ event });
});

/** DELETE /api/admin/timeline/:id */
export const DELETE = adminRoute(async (_request: Request, ctx: Ctx) => {
  if (!deleteEvent(await idFrom(ctx))) return NextResponse.json({ error: 'No such event' }, { status: 404 });
  return NextResponse.json({ ok: true });
});
