import { NextResponse } from 'next/server';
import { adminRoute, readJson } from '@/lib/admin-api';
import { goalFields } from '@/lib/goal-input';
import { addGoal, listGoals, nextGoalOrder } from '@/lib/roadmap';

export const dynamic = 'force-dynamic';

/** GET /api/admin/goals */
export const GET = adminRoute(() => NextResponse.json({ goals: listGoals() }));

/** POST /api/admin/goals  { title, description?, status?: planned|in_progress|achieved, progress?: 0-100, targetDate?, sortOrder? } */
export const POST = adminRoute(async (request: Request) => {
  const body = await readJson(request);
  const f = goalFields({ status: 'planned', ...body }, true);
  const goal = addGoal({
    title: f.title!,
    description: f.description ?? null,
    status: f.status ?? 'planned',
    progress: f.progress ?? 0,
    targetDate: f.targetDate ?? null,
    sortOrder: f.sortOrder ?? nextGoalOrder(),
  });
  return NextResponse.json({ goal }, { status: 201 });
});
