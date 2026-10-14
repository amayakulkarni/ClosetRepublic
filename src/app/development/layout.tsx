import { getNature } from '@/lib/nature';
import { Art } from '@/components/Art';
import { ContributeTabs } from '@/components/contribute/ContributeTabs';
import { GITHUB_URL } from '@/lib/community';

// Shared top of /development and its Constitution, Writing and Artwork tabs.
export default async function DevelopmentLayout({ children }: { children: React.ReactNode }) {
  const { on } = await getNature();
  return (
    <>
      <header className="page-head">
        <div>
          <h1>{on ? 'Ministry of Public Works' : 'Development and contributing'}</h1>
          <p className="lede">
            {on
              ? 'The Republic is built in the open by its citizens. Every road, bridge and passport stamp lives in a public repository, and anyone may pick up a shovel.'
              : 'Closet Republic is open source and built by its community. Help with the code, the constitution, the writing or the artwork.'}
          </p>
          <p className="hero__actions">
            <a className="button" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              {on ? 'Visit the public works' : 'View on GitHub'}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a className="button button--ghost" href={`${GITHUB_URL}/issues`} target="_blank" rel="noopener noreferrer">
              Issues
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        </div>
        <Art name="looking-ahead" nature={on} className="page-head__art" />
      </header>
      <ContributeTabs />
      {children}
    </>
  );
}
