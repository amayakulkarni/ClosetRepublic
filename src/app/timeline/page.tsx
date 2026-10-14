import type { Metadata } from 'next';
import { getNature } from '@/lib/nature';
import { Art } from '@/components/Art';
import { Notice } from '@/components/Notice';
import { TIMEZONE } from '@/lib/funds';
import { listEvents, listGoals, type Goal, type GoalStatus } from '@/lib/roadmap';

export const metadata: Metadata = { title: 'Timeline and goals' };
export const dynamic = 'force-dynamic';

const STATUS: Record<GoalStatus, { plain: string; nature: string }> = {
  planned: { plain: 'Planned', nature: 'Proposed' },
  in_progress: { plain: 'In progress', nature: 'Under construction' },
  achieved: { plain: 'Achieved', nature: 'Ratified' },
};

const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Today as YYYY-MM-DD in the Republic's time zone. */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());

function GoalCard({ goal, nature }: { goal: Goal; nature: boolean }) {
  const label = nature ? STATUS[goal.status].nature : STATUS[goal.status].plain;
  return (
    <li className="goal-card" data-status={goal.status}>
      <p className="goal-card__status">{label}</p>
      <h3>{goal.title}</h3>
      {goal.description && <p className="goal-card__text">{goal.description}</p>}
      <div
        className="meter"
        role="progressbar"
        aria-label={`${goal.title} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={goal.progress}
        aria-valuetext={`${goal.progress}% done, ${label}`}
      >
        <span style={{ width: `${goal.progress}%` }} />
      </div>
      <p className="hint">
        {goal.progress}% done
        {goal.targetDate && goal.status !== 'achieved' && <> · target {longDate(goal.targetDate)}</>}
      </p>
    </li>
  );
}

export default async function TimelinePage() {
  const { on } = await getNature();
  let goals: Goal[] = [];
  let events: ReturnType<typeof listEvents> = [];
  let problem: string | null = null;
  try {
    goals = listGoals();
    events = listEvents();
  } catch (err) {
    console.error('timeline: database unavailable', err);
    problem = 'The timeline could not be loaded just now.';
  }

  const now = today();
  const past = events.filter((e) => e.date <= now).reverse();
  const upcoming = events.filter((e) => e.date > now);
  const open = goals.filter((g) => g.status !== 'achieved');
  const achieved = goals.filter((g) => g.status === 'achieved');

  const eventList = (list: typeof events, kind: 'past' | 'upcoming') => (
    <ol className="timeline" data-kind={kind}>
      {list.map((e) => (
        <li key={e.id} className="timeline__item">
          <time dateTime={e.date} className="timeline__date">
            {longDate(e.date)}
          </time>
          <h3 className="timeline__title">
            {e.link ? (
              <a href={e.link} {...(e.link.startsWith('/') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}>
                {e.title}
                {!e.link.startsWith('/') && <span className="sr-only"> (opens in a new tab)</span>}
              </a>
            ) : (
              e.title
            )}
          </h3>
          {e.description && <p className="timeline__text">{e.description}</p>}
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{on ? 'The Five-Year Plan' : 'Timeline and goals'}</h1>
          <p className="lede">
            {on
              ? 'The official record of what the Republic has achieved, what it is building and what it has solemnly promised. Dates are binding, mostly.'
              : 'Where Closet Republic has been, what is coming up, and what we are working towards.'}
          </p>
        </div>
        <Art name="pondering" nature={on} className="page-head__art" />
      </header>

      {problem && <Notice tone="warn">{problem}</Notice>}

      <section aria-labelledby="goals-heading" className="section">
        <h2 id="goals-heading">{on ? 'National goals' : 'Goals'}</h2>
        {open.length > 0 ? (
          <ul className="goal-grid">
            {open.map((g) => (
              <GoalCard key={g.id} goal={g} nature={on} />
            ))}
          </ul>
        ) : (
          !problem && <p>{achieved.length ? 'Every goal has been achieved. New ones are on the way.' : 'No goals have been set yet.'}</p>
        )}
        {achieved.length > 0 && (
          <>
            <h3 className="goal-grid__subhead">{on ? 'Ratified' : 'Achieved'}</h3>
            <ul className="goal-grid">
              {achieved.map((g) => (
                <GoalCard key={g.id} goal={g} nature={on} />
              ))}
            </ul>
          </>
        )}
      </section>

      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming-heading" className="section">
          <h2 id="upcoming-heading">{on ? 'Scheduled proceedings' : 'Coming up'}</h2>
          {eventList(upcoming, 'upcoming')}
        </section>
      )}

      <section aria-labelledby="history-heading" className="section">
        <h2 id="history-heading">{on ? 'The national record' : 'Timeline'}</h2>
        {past.length > 0 ? eventList(past, 'past') : !problem && <p>Nothing on the timeline yet.</p>}
      </section>
    </>
  );
}
