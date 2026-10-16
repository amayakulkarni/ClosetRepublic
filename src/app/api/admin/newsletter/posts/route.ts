import { NextResponse } from 'next/server';
import { adminRoute } from '@/lib/admin-api';
import { listPostsForIssue } from '@/lib/newsletter';

export const dynamic = 'force-dynamic';

/** GET /api/admin/newsletter/posts?days=30&q=text  published gazette posts, newest first. */
export const GET = adminRoute(async (request: Request) => {
  const q = new URL(request.url).searchParams;
  const days = Number(q.get('days')) || 0;
  try {
    return NextResponse.json({ posts: await listPostsForIssue({ days: days > 0 ? days : undefined, q: q.get('q') || undefined }) });
  } catch (err) {
    return NextResponse.json({ error: `Could not load posts from Ghost: ${(err as Error).message}` }, { status: 502 });
  }
});
