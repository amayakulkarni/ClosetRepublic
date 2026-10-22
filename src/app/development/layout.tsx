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
          <h1>Development and contributing</h1>
          <p className="lede">
            Closet Republic is open source and built by its community. Help with the code, the constitution, the writing or the artwork.
          </p>
          <p className="hero__actions">
            <a className="button" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              View on GitHub
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a className="button button--ghost" href={`${GITHUB_URL}/issues`} target="_blank" rel="noopener noreferrer">
              Issues
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            {process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL && (
              <a className="button button--ghost" href={process.env.NEXT_PUBLIC_GITHUB_SPONSORS_URL} target="_blank" rel="noopener noreferrer">
                Sponsor
                <span className="sr-only"> on GitHub (opens in a new tab)</span>
              </a>
            )}
          </p>
        </div>
        <Art name="looking-ahead" nature={on} className="page-head__art" />
      </header>
      <ContributeTabs />
      {children}
    </>
  );
}
