import type { Metadata } from 'next';
import { getNature } from '@/lib/nature';
import { Art } from '@/components/Art';

export const metadata: Metadata = { title: 'Development of CR' };

const REPO = 'https://github.com/amayakulkarni/ClosetRepublic';

const WAYS = [
  {
    nature: 'Fix the roads',
    plain: 'Report a bug',
    text: 'Something broken, confusing or hard to use with a screen reader? Open an issue and describe what happened.',
    href: `${REPO}/issues/new`,
    link: 'Open an issue',
  },
  {
    nature: 'Draft a bill',
    plain: 'Suggest an idea',
    text: 'A new page, a better passport, a kinder wording. Start a discussion in the issues before building something big.',
    href: `${REPO}/issues`,
    link: 'Browse issues',
  },
  {
    nature: 'Lay new bricks',
    plain: 'Send code',
    text: 'Fork the repository, make your change on a branch and open a pull request. Small, focused changes are the easiest to review.',
    href: `${REPO}/fork`,
    link: 'Fork the repository',
  },
  {
    nature: 'Paint the walls',
    plain: 'Make art',
    text: 'Illustrations, icons and nature-mode effects are welcome, as long as they come with alt text that describes how they look.',
    href: REPO,
    link: 'See the art folders',
  },
];

export default async function DevelopmentPage() {
  const { on } = await getNature();
  return (
    <>
      <header className="page-head">
        <div>
          <h1>{on ? 'Ministry of Public Works' : 'Development and contributing'}</h1>
          <p className="lede">
            {on
              ? 'The Republic is built in the open by its citizens. Every road, bridge and passport stamp lives in a public repository, and anyone may pick up a shovel.'
              : 'Closet Republic is open source. The whole site lives on GitHub, and contributions of every size are welcome.'}
          </p>
          <p className="hero__actions">
            <a className="button" href={REPO} target="_blank" rel="noopener noreferrer">
              {on ? 'Visit the public works' : 'View on GitHub'}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a className="button button--ghost" href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">
              Issues
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
          <p className="hint">
            <code>github.com/amayakulkarni/ClosetRepublic</code>
          </p>
        </div>
        <Art name="looking-ahead" nature={on} className="page-head__art" />
      </header>

      <section aria-labelledby="ways-heading" className="section">
        <h2 id="ways-heading">{on ? 'How citizens build the Republic' : 'Ways to contribute'}</h2>
        <ul className="contribute-grid">
          {WAYS.map((w) => (
            <li key={w.href + w.plain} className="contribute-card">
              <h3>{on ? w.nature : w.plain}</h3>
              <p>{w.text}</p>
              <a href={w.href} target="_blank" rel="noopener noreferrer">
                {w.link}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="setup-heading" className="section">
        <h2 id="setup-heading">{on ? 'Raising your own Republic' : 'Run it locally'}</h2>
        <p>The site is a Next.js app with Ghost as its content backend. You need Node 20.9 or newer.</p>
        <pre className="code-block">
          <code>{`git clone ${REPO}.git
cd ClosetRepublic
npm install
cp .env.example .env.local
npm run dev   # http://localhost:40001`}</code>
        </pre>
        <p>
          The README in the repository explains how pages map to Ghost content, how nature mode works and how the treasury is set up.
        </p>
      </section>

      <section aria-labelledby="rules-heading" className="section">
        <h2 id="rules-heading">{on ? 'Building codes' : 'A few house rules'}</h2>
        <ul className="plain-list">
          <li>The site is dark only, and nature mode is on by default. Check your change in both modes.</li>
          <li>Every image needs alt text, including a description of any visual effect it has.</li>
          <li>Be kind. Many citizens spent years hiding who they are; this is a place where they do not have to.</li>
        </ul>
      </section>
    </>
  );
}
