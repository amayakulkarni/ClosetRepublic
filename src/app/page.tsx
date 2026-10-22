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
            Closet Republic
          </h1>
          <p className="lede">
            An online home for people who once had to hide who they are to avoid discrimination and being cast out.
          </p>
          <p className="plain-note">
            Closet Republic is an online community, not a shop. Reading and taking part on this website is free. Memberships to the Discord server start at $1 a month, and nothing physical is sold.
          </p>
          <p className="hero__actions">
            <Link className="button" href="/constitution">
              Read the constitution
            </Link>
            <Link className="button button--ghost" href="/discord/link">
              Join the Discord
            </Link>
          </p>
        </div>
        <Art name="mechanical-love" nature={on} className="hero__art" />
      </section>

      <nav aria-label="Start here" className="start-here">
        <Link href="/constitution">Constitution</Link>
        <Link href="/passport">Make a passport</Link>
        <Link href="/gazette">Read the blog</Link>
        <Link href="/gazette#newsletter">Get the newsletter</Link>
      </nav>

      {problem && <Notice tone="warn">{problem}</Notice>}

      {latest && (
        <section aria-labelledby="featured-heading" className="featured">
          <h2 id="featured-heading" className="eyebrow">
            Featured
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
                Read
              </Link>
            </div>
          </article>
        </section>
      )}

      {!problem && !latest && <Notice>Nothing has been featured yet. Mark a post as featured in Ghost to show it here.</Notice>}

      {earlier.length > 0 && (
        <section aria-labelledby="earlier-heading" className="section">
          <h2 id="earlier-heading">Previously featured</h2>
          <div className="card-grid">
            {earlier.map((g) => (
              <PostCard key={g.base.id} post={g.shown} base={g.base} nature={on} />
            ))}
          </div>
        </section>
      )}

      <StageWidget nature={on} />

      <section aria-labelledby="lifeline-heading" className="section lifeline-callout">
        <h2 id="lifeline-heading">If this site ever disappears</h2>
        <p>
          Join the Lifeline to get an email with the new address and payment links if closetrepublic.com is taken down. Nothing else.
        </p>
        <Link className="button" href="/lifeline">
          Join the Lifeline
        </Link>
      </section>

      <SupportWidget />
    </>
  );
}
