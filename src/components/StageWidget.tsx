import { STAGE_URL } from '@/lib/community';

// Homepage widget for Stage, the community forum. The server fetches NodeBB's public
// /api/recent (guest-visible topics only), so visitors' browsers never contact the forum
// from this page. Author names are left out on purpose. If the forum is down, the widget
// still links to it.

type Topic = { tid: number; slug: string; title: string; postcount: number; lastposttimeISO?: string; timestampISO?: string; category?: { name?: string } };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

async function recentTopics(): Promise<Topic[] | null> {
  try {
    const res = await fetch(`${STAGE_URL}/api/recent`, {
      headers: { accept: 'application/json' },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { topics?: Topic[] };
    return Array.isArray(body.topics) ? body.topics.filter((t) => t && t.slug && t.title).slice(0, 5) : null;
  } catch {
    return null;
  }
}

function when(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

export async function StageWidget({ nature }: { nature: boolean }) {
  const topics = await recentTopics();
  const host = STAGE_URL.replace(/^https?:\/\//, '');
  return (
    <section aria-labelledby="stage-heading" className="section stage-widget">
      <div className="stage-widget__head">
        <h2 id="stage-heading">{nature ? 'Now on the Stage' : 'Community forum'}</h2>
        <p>
          {nature
            ? 'The Stage is where citizens speak: debates, proposals, art and everyday company.'
            : 'Stage is the Closet Republic forum for discussion, ideas and support. Pseudonyms are welcome.'}
        </p>
      </div>
      {topics && topics.length > 0 ? (
        <ul className="stage-widget__list">
          {topics.map((t) => {
            const date = when(t.lastposttimeISO || t.timestampISO);
            const replies = Math.max(0, (t.postcount || 1) - 1);
            return (
              <li key={t.tid}>
                <a href={`${STAGE_URL}/topic/${t.slug}`} target="_blank" rel="noopener noreferrer">
                  {decode(t.title)}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                <span className="stage-widget__meta">
                  {[t.category?.name && decode(t.category.name), `${replies} ${replies === 1 ? 'reply' : 'replies'}`, date].filter(Boolean).join(' · ')}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="stage-widget__empty">{topics ? 'No public topics yet. Start the first one.' : 'Recent topics are not available right now.'}</p>
      )}
      <a className="button" href={STAGE_URL} target="_blank" rel="noopener noreferrer">
        {nature ? 'Take the Stage' : `Visit ${host}`}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </section>
  );
}
