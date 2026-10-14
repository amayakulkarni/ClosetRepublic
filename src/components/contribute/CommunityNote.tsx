import type { CommunityLink } from '@/lib/community';

/** The ground rules for creative contributions, shown above every sign-up form. */
export function CommunityNote({ links, work }: { links: CommunityLink[]; work: string }) {
  return (
    <aside className="community-note" aria-labelledby="community-note-heading">
      <h2 id="community-note-heading">Before you get in touch</h2>
      <ul>
        <li>
          <strong>Do not send private or unpublished {work} by DM, email or this form.</strong> Share only a link to work that is already public,
          such as a Reddit post or an Instagram page or post.
        </li>
        <li>
          <strong>We verify every link.</strong> Before anything is used, we check that you made the {work} or commissioned it. We may contact
          you on the platform you link to.
        </li>
        <li>
          <strong>Have an idea? Share it in public, not privately.</strong> Ideas go to the community so everyone can discuss them:
          <ul className="community-links">
            {links.map((l) => (
              <li key={l.name}>
                {l.url ? (
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.name}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : (
                  <span>
                    {l.name} <span className="hint">(link coming soon)</span>
                  </span>
                )}{' '}
                <span className="hint">· {l.hint}</span>
              </li>
            ))}
          </ul>
        </li>
      </ul>
    </aside>
  );
}
