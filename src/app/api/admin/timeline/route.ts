import { NextResponse } from 'next/server';
import { adminRoute, dateFrom, linkFrom, readJson, textFrom } from '@/lib/admin-api';
import { addEvent, listEvents } from '@/lib/roadmap';

export const dynamic = 'force-dynamic';

/** GET /api/admin/timeline */
export const GET = adminRoute(() => NextResponse.json({ timeline: listEvents() }));

/** POST /api/admin/timeline  { date: "2026-10-14", title, description?, link? } */
export const POST = adminRoute(async (request: Request) => {
  const body = await readJson(request);
  const event = addEvent({
    date: dateFrom(body.date, 'date', { required: true })!,
    title: textFrom(body.title, 'title', { required: true, max: 200 })!,
    description: textFrom(body.description, 'description'),
    link: linkFrom(body.link),
  });
  return NextResponse.json({ event }, { status: 201 });
});
