'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

type GoalStatus = 'planned' | 'in_progress' | 'achieved';
type Goal = { id: number; title: string; description: string | null; status: GoalStatus; progress: number; targetDate: string | null; sortOrder: number };
type Event = { id: number; date: string; title: string; description: string | null; link: string | null };

const STATUS_LABEL: Record<GoalStatus, string> = { planned: 'Planned', in_progress: 'In progress', achieved: 'Achieved' };

const EMPTY_GOAL = { title: '', description: '', status: 'planned' as GoalStatus, progress: '0', targetDate: '', sortOrder: '' };
const EMPTY_EVENT = { date: '', title: '', description: '', link: '' };

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });

export function RoadmapAdmin() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [goal, setGoal] = useState({ ...EMPTY_GOAL, id: 0 });
  const [event, setEvent] = useState({ ...EMPTY_EVENT, id: 0 });

  const load = useCallback(async () => {
    const [g, t] = await Promise.all([api<{ goals: Goal[] }>('/api/admin/goals'), api<{ timeline: Event[] }>('/api/admin/timeline')]);
    setGoals(g.goals);
    setEvents([...t.timeline].reverse());
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);

  const run = async (fn: () => Promise<unknown>, done: string, after?: () => void) => {
    try {
      await fn();
      setMessage(done);
      after?.();
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const saveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const { id, ...fields } = goal;
    const body = JSON.stringify({ ...fields, sortOrder: fields.sortOrder === '' ? undefined : fields.sortOrder });
    run(
      () => (id ? api(`/api/admin/goals/${id}`, { method: 'PUT', body }) : api('/api/admin/goals', { method: 'POST', body })),
      id ? 'Goal updated.' : 'Goal added.',
      () => setGoal({ ...EMPTY_GOAL, id: 0 }),
    );
  };

  const saveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const { id, ...fields } = event;
    const body = JSON.stringify(fields);
    run(
      () => (id ? api(`/api/admin/timeline/${id}`, { method: 'PUT', body }) : api('/api/admin/timeline', { method: 'POST', body })),
      id ? 'Timeline event updated.' : 'Timeline event added.',
      () => setEvent({ ...EMPTY_EVENT, id: 0 }),
    );
  };

  const editGoal = (g: Goal) => {
    setGoal({ id: g.id, title: g.title, description: g.description ?? '', status: g.status, progress: String(g.progress), targetDate: g.targetDate ?? '', sortOrder: String(g.sortOrder) });
    document.getElementById('g-title')?.focus();
  };
  const editEvent = (ev: Event) => {
    setEvent({ id: ev.id, date: ev.date, title: ev.title, description: ev.description ?? '', link: ev.link ?? '' });
    document.getElementById('t-date')?.focus();
  };

  if (!loaded) return <p>{message ?? 'Loading the timeline…'}</p>;

  return (
    <div>
      <p className="lede">
        Goals and timeline events shown on <a href="/timeline">/timeline</a>. Events dated after today appear under “Coming up”.
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
      {message && <p className="notice">{message}</p>}

      <div className="admin-grid">
        <form className="admin-card" onSubmit={saveGoal}>
          <h2>{goal.id ? 'Edit goal' : 'Add a goal'}</h2>
          <div className="field">
            <label htmlFor="g-title">Title</label>
            <input id="g-title" required maxLength={200} value={goal.title} onChange={(e) => setGoal({ ...goal, title: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="g-desc">Description</label>
            <textarea id="g-desc" rows={3} value={goal.description} onChange={(e) => setGoal({ ...goal, description: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="g-status">Status</label>
            <select
              id="g-status"
              value={goal.status}
              onChange={(e) => {
                const status = e.target.value as GoalStatus;
                setGoal({ ...goal, status, progress: status === 'achieved' ? '100' : goal.progress });
              }}
            >
              <option value="planned">Planned</option>
              <option value="in_progress">In progress</option>
              <option value="achieved">Achieved</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="g-progress">Progress (%)</label>
            <input id="g-progress" type="number" min="0" max="100" step="1" value={goal.progress} onChange={(e) => setGoal({ ...goal, progress: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="g-target">Target date (optional)</label>
            <input id="g-target" type="date" value={goal.targetDate} onChange={(e) => setGoal({ ...goal, targetDate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="g-order">Position (lower shows first; blank puts it last)</label>
            <input id="g-order" type="number" step="1" value={goal.sortOrder} onChange={(e) => setGoal({ ...goal, sortOrder: e.target.value })} />
          </div>
          <div className="admin-actions">
            <button className="button">{goal.id ? 'Save goal' : 'Add goal'}</button>
            {goal.id > 0 && (
              <button type="button" className="link-button" onClick={() => setGoal({ ...EMPTY_GOAL, id: 0 })}>
                Cancel
              </button>
            )}
          </div>
        </form>

        <form className="admin-card" onSubmit={saveEvent}>
          <h2>{event.id ? 'Edit timeline event' : 'Add a timeline event'}</h2>
          <div className="field">
            <label htmlFor="t-date">Date</label>
            <input id="t-date" type="date" required value={event.date} onChange={(e) => setEvent({ ...event, date: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="t-title">Title</label>
            <input id="t-title" required maxLength={200} value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="t-desc">Description</label>
            <textarea id="t-desc" rows={3} value={event.description} onChange={(e) => setEvent({ ...event, description: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="t-link">Link (optional)</label>
            <input id="t-link" placeholder="/gazette/my-post or https://…" value={event.link} onChange={(e) => setEvent({ ...event, link: e.target.value })} />
          </div>
          <div className="admin-actions">
            <button className="button">{event.id ? 'Save event' : 'Add event'}</button>
            {event.id > 0 && (
              <button type="button" className="link-button" onClick={() => setEvent({ ...EMPTY_EVENT, id: 0 })}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <section className="section" aria-labelledby="goals-list-heading">
        <h2 id="goals-list-heading">Goals</h2>
        <div className="table-scroll" data-no-swipe>
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Goal</th>
                <th scope="col">Status</th>
                <th scope="col">Progress</th>
                <th scope="col">Target</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {goals.map((g) => (
                <tr key={g.id}>
                  <td>{g.sortOrder}</td>
                  <td>
                    <strong>{g.title}</strong>
                    {g.description && <div className="hint">{g.description}</div>}
                  </td>
                  <td>{STATUS_LABEL[g.status]}</td>
                  <td>{g.progress}%</td>
                  <td>{g.targetDate ? shortDate(g.targetDate) : '—'}</td>
                  <td className="admin-row-actions">
                    <button className="link-button" onClick={() => editGoal(g)}>
                      Edit<span className="sr-only"> {g.title}</span>
                    </button>
                    <button
                      className="link-button"
                      onClick={() => confirm(`Delete the goal “${g.title}”?`) && run(() => api(`/api/admin/goals/${g.id}`, { method: 'DELETE' }), 'Goal deleted.')}
                    >
                      Delete<span className="sr-only"> {g.title}</span>
                    </button>
                  </td>
                </tr>
              ))}
              {goals.length === 0 && (
                <tr>
                  <td colSpan={6}>No goals yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section" aria-labelledby="events-list-heading">
        <h2 id="events-list-heading">Timeline</h2>
        <div className="table-scroll" data-no-swipe>
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Event</th>
                <th scope="col">Link</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td>{shortDate(ev.date)}</td>
                  <td>
                    <strong>{ev.title}</strong>
                    {ev.description && <div className="hint">{ev.description}</div>}
                  </td>
                  <td className="admin-link-cell">{ev.link ?? '—'}</td>
                  <td className="admin-row-actions">
                    <button className="link-button" onClick={() => editEvent(ev)}>
                      Edit<span className="sr-only"> {ev.title}</span>
                    </button>
                    <button
                      className="link-button"
                      onClick={() => confirm(`Delete “${ev.title}” from the timeline?`) && run(() => api(`/api/admin/timeline/${ev.id}`, { method: 'DELETE' }), 'Timeline event deleted.')}
                    >
                      Delete<span className="sr-only"> {ev.title}</span>
                    </button>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={4}>No timeline events yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
