import Link from 'next/link';
import { getNature } from '@/lib/nature';
import { getGazette } from '@/lib/gazette';
import { excerptOf, safely } from '@/lib/ghost';
import { Art } from '@/components/Art';
import { AuthorLink } from '@/components/AuthorLink';
import { ClosetMark } from '@/components/Logo';
import { FeatureImage } from '@/components/FeatureImage';
import { Notice } from '@/components/Notice';
import { PostCard } from '@/components/PostCard';
import { StageWidget } from '@/components/StageWidget';
import { SupportWidget } from '@/components/SupportWidget';

export default async function Home() {
  const { on } = await getNature();
  const { data: gazette, problem } = await safely(() => getGazette(on), []);
  const featured = gazette.filter((g) => g.base.featured);
  const [latest, ...earlier] = featured;

  return (
    <>
      <section className="hero">
        <div className="hero__text">
          <ClosetMark size={96} />
          <h1>
            {on ? 'Welcome to the Closet Republic' : 'Closet Republic'}
          </h1>
          <p className="lede">
            {on
              ? 'A sovereign nation for harmonious people who once had to hide their true selves to fit in a box. No borders, no boxes, naturally exceptional.'
              : 'An online home for people who once had to hide who they are to avoid discrimination and being cast out.'}
          </p>
          <p className="hero__actions">
            <Link className="button" href="/passport">
              {on ? 'Apply for citizenship' : 'Make your passport'}
            </Link>
            <Link className="button button--ghost" href="/constitution">
              Read the constitution
            </Link>
            <Link className="button button--ghost" href="/gazette#newsletter">
              Subscribe to the newsletter
            </Link>
          </p>
        </div>
        <Art name="mechanical-love" nature={on} className="hero__art" />
      </section>

      {problem && <Notice tone="warn">{problem}</Notice>}

      {latest && (
        <section aria-labelledby="featured-heading" className="featured">
          <h2 id="featured-heading" className="eyebrow">
            {on ? 'Latest Gazette notification' : 'Featured'}
          </h2>
          <article className="featured__card">
            <FeatureImage post={latest.shown} nature={on} />
            <div>
              <h3 className="featured__title">
                <Link href={`/gazette/${latest.base.slug}`}>{latest.shown.title}</Link>
              </h3>
              {excerptOf(latest.shown) && <p>{excerptOf(latest.shown)}</p>}
              <p className="post-card__meta">
                <AuthorLink authors={latest.base.authors} nature={on} />
              </p>
              <Link className="button" href={`/gazette/${latest.base.slug}`}>
                Read{on ? ' the notification' : ''}
              </Link>
            </div>
          </article>
        </section>
      )}

      {!problem && !latest && <Notice>Nothing has been featured yet. Mark a post as featured in Ghost to show it here.</Notice>}

      {earlier.length > 0 && (
        <section aria-labelledby="earlier-heading" className="section">
          <h2 id="earlier-heading">{on ? 'From the archives of the Gazette' : 'Previously featured'}</h2>
          <div className="card-grid">
            {earlier.map((g) => (
              <PostCard key={g.base.id} post={g.shown} base={g.base} nature={on} />
            ))}
          </div>
        </section>
      )}

      <StageWidget nature={on} />

      <section aria-labelledby="lifeline-heading" className="section lifeline-callout">
        <h2 id="lifeline-heading">{on ? 'Register for the Emergency Broadcast' : 'If this site ever disappears'}</h2>
        <p>
          {on
            ? 'Should the Republic be forced into exile, every registered citizen will be told where its new seat is.'
            : 'Join the Lifeline and we will email you the new address, GitHub and donation links if closetrepublic.com is taken down. Nothing else.'}
        </p>
        <Link className="button" href="/lifeline">
          {on ? 'Register' : 'Join the Lifeline'}
        </Link>
      </section>

      <SupportWidget />
    </>
  );
}
