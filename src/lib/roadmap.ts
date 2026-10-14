import 'server-only';
import { db } from './db';

// The Republic's timeline (dated events, past and upcoming) and its goals.
// Managed from /admin; shown on /timeline.

export type GoalStatus = 'planned' | 'in_progress' | 'achieved';
export const GOAL_STATUSES: GoalStatus[] = ['planned', 'in_progress', 'achieved'];

export type TimelineEvent = {
  id: number;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  description: string | null;
  link: string | null;
};

export type Goal = {
  id: number;
  title: string;
  description: string | null;
  status: GoalStatus;
  /** 0–100 */
  progress: number;
  /** YYYY-MM-DD or null */
  targetDate: string | null;
  sortOrder: number;
};

type GoalRow = Omit<Goal, 'targetDate' | 'sortOrder'> & { target_date: string | null; sort_order: number };
const toGoal = (r: GoalRow): Goal => ({
  id: r.id,
  title: r.title,
  description: r.description,
  status: r.status,
  progress: r.progress,
  targetDate: r.target_date,
  sortOrder: r.sort_order,
});

const now = () => new Date().toISOString();

// ---------- timeline ----------

export function listEvents(): TimelineEvent[] {
  return db().prepare('SELECT id, date, title, description, link FROM timeline_events ORDER BY date ASC, id ASC').all() as TimelineEvent[];
}

export function getEvent(id: number): TimelineEvent | null {
  return (db().prepare('SELECT id, date, title, description, link FROM timeline_events WHERE id = ?').get(id) as TimelineEvent) ?? null;
}

export type EventInput = Omit<TimelineEvent, 'id'>;

export function addEvent(e: EventInput) {
  const info = db()
    .prepare('INSERT INTO timeline_events (date, title, description, link, created_at, updated_at) VALUES (@date, @title, @description, @link, @at, @at)')
    .run({ ...e, at: now() });
  return getEvent(Number(info.lastInsertRowid))!;
}

export function updateEvent(id: number, patch: Partial<EventInput>) {
  const current = getEvent(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  db()
    .prepare('UPDATE timeline_events SET date = @date, title = @title, description = @description, link = @link, updated_at = @at WHERE id = @id')
    .run({ ...next, at: now() });
  return getEvent(id);
}

export const deleteEvent = (id: number) => db().prepare('DELETE FROM timeline_events WHERE id = ?').run(id).changes > 0;

// ---------- goals ----------

export function listGoals(): Goal[] {
  return (db().prepare('SELECT * FROM goals ORDER BY sort_order ASC, id ASC').all() as GoalRow[]).map(toGoal);
}

export function getGoal(id: number): Goal | null {
  const row = db().prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow | undefined;
  return row ? toGoal(row) : null;
}

export type GoalInput = Omit<Goal, 'id'>;

export function addGoal(g: GoalInput) {
  const info = db()
    .prepare(
      `INSERT INTO goals (title, description, status, progress, target_date, sort_order, created_at, updated_at)
       VALUES (@title, @description, @status, @progress, @targetDate, @sortOrder, @at, @at)`,
    )
    .run({ ...g, at: now() });
  return getGoal(Number(info.lastInsertRowid))!;
}

export function updateGoal(id: number, patch: Partial<GoalInput>) {
  const current = getGoal(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  db()
    .prepare(
      `UPDATE goals SET title = @title, description = @description, status = @status, progress = @progress,
       target_date = @targetDate, sort_order = @sortOrder, updated_at = @at WHERE id = @id`,
    )
    .run({ ...next, at: now() });
  return getGoal(id);
}

export const deleteGoal = (id: number) => db().prepare('DELETE FROM goals WHERE id = ?').run(id).changes > 0;

/** Next sort position, so new goals go to the end of the list. */
export const nextGoalOrder = () => ((db().prepare('SELECT MAX(sort_order) m FROM goals').get() as { m: number | null }).m ?? 0) + 1;
