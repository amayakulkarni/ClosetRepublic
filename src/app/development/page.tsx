import type { Metadata } from 'next';
import { getNature } from '@/lib/nature';
import { GITHUB_URL as REPO } from '@/lib/community';

export const metadata: Metadata = { title: 'Development of CR' };

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
    text: 'A new page, a better passport, a kinder wording. Ideas are discussed in public, so open an issue rather than sending them privately.',
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
];

export default async function DevelopmentPage() {
  const { on } = await getNature();
  return (
    <>
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
        <p>
          Want to help with the <a href="/development/constitution">constitution</a>, <a href="/development/writing">writing</a> or{' '}
          <a href="/development/art">artwork</a>? Each has its own tab above.
        </p>
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
