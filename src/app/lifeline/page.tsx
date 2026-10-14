import type { Metadata } from 'next';
import { getNature } from '@/lib/nature';
import { Art } from '@/components/Art';
import { LifelineForm } from '@/components/lifeline/LifelineForm';
import { GITHUB_URL } from '@/lib/community';

export const metadata: Metadata = {
  title: 'Lifeline',
  description: 'Leave your email so we can tell you where Closet Republic went if the site is ever taken down.',
};

export default async function LifelinePage() {
  const { on } = await getNature();
  return (
    <>
      <header className="page-head">
        <div>
          <h1>{on ? 'Emergency Broadcast System' : 'Lifeline'}</h1>
          <p className="lede">
            {on
              ? 'Should the Republic ever be forced into exile, the government will broadcast its new seat to every registered citizen. Register your address below.'
              : 'Sites like this one can be taken down. Leave your email and, if that ever happens, we will tell you where to find us.'}
          </p>
        </div>
        <Art name="reflecting" nature={on} className="page-head__art" />
      </header>

      <section aria-labelledby="what-heading" className="section">
        <h2 id="what-heading">{on ? 'What the broadcast contains' : 'What you will get'}</h2>
        <ul className="plain-list">
          <li>The address of the new site.</li>
          <li>
            The GitHub repository, where the code and the constitution live:{' '}
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              github.com/amayakulkarni/ClosetRepublic<span className="sr-only"> (opens in a new tab)</span>
            </a>
            .
          </li>
          <li>The donation link and any other resources we need to share.</li>
        </ul>
        <p>
          That is all. One welcome email now, and nothing else unless the site goes down. No newsletters, and your address is never shared. Every email
          has a way to leave, and you can also just reply &ldquo;unsubscribe&rdquo;.
        </p>
      </section>

      <section aria-labelledby="join-heading" className="section">
        <h2 id="join-heading">{on ? 'Register for the broadcast' : 'Join the Lifeline'}</h2>
        <LifelineForm />
      </section>
    </>
  );
}
