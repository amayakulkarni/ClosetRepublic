import 'server-only';
import { BadRequest, amountFrom, dateFrom, textFrom } from './admin-api';
import { GOAL_STATUSES, type GoalInput, type GoalStatus } from './roadmap';

/** Validates the goal fields present in a request body (all of them when `full`). */
export function goalFields(body: Record<string, unknown>, full: boolean): Partial<GoalInput> {
  const has = (k: string) => full || k in body;
  const out: Partial<GoalInput> = {};
  if (has('title')) out.title = textFrom(body.title, 'title', { required: true, max: 200 })!;
  if (has('description')) out.description = textFrom(body.description, 'description');
  if (has('status')) {
    const status = String(body.status ?? '');
    if (!GOAL_STATUSES.includes(status as GoalStatus)) throw new BadRequest('status must be planned, in_progress or achieved');
    out.status = status as GoalStatus;
  }
  if ('progress' in body && body.progress !== '' && body.progress != null) {
    const p = amountFrom(body.progress, 'progress');
    if (p < 0 || p > 100) throw new BadRequest('progress must be between 0 and 100');
    out.progress = Math.round(p);
  }
  if (has('targetDate')) out.targetDate = dateFrom(body.targetDate, 'targetDate');
  if ('sortOrder' in body && body.sortOrder !== '' && body.sortOrder != null) out.sortOrder = Math.round(amountFrom(body.sortOrder, 'sortOrder'));
  // An achieved goal is 100% done.
  if (out.status === 'achieved') out.progress = 100;
  return out;
}
