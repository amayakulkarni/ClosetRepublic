import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getNature } from '@/lib/nature';
import { getEntry, getNatureEdition, safely } from '@/lib/ghost';
import { AuthorLink } from '@/components/AuthorLink';
import { FeatureImage } from '@/components/FeatureImage';
import { GhostContent } from '@/components/GhostContent';
import { NewsletterWidget } from '@/components/NewsletterWidget';
import { Notice } from '@/components/Notice';
import { SupportWidget } from '@/components/SupportWidget';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await safely(() => getEntry(slug), null);
  return { title: data?.title ?? 'Gazette', description: data?.custom_excerpt || data?.excerpt || undefined };
}

export default async function GazettePost({ params }: Props) {
  const { slug } = await params;
  const { on } = await getNature();
  const { data, problem } = await safely(
    async () => {
      const [base, edition] = await Promise.all([getEntry(slug), getNatureEdition(slug)]);
      return { base, edition };
    },
    { base: null, edition: null },
  );
  if (problem) return <Notice tone="warn">{problem}</Notice>;
  if (!data.base) notFound();

  const { base, edition } = data;
  const shown = on && edition ? edition : base;
  const date = base.published_at ? new Date(base.published_at) : null;

  return (
    <article className="post">
      <p className="eyebrow">
        <Link href="/gazette">{on ? 'Gazette of Closet Republic' : 'Blog'}</Link>
        {on && edition && ' · Nature edition'}
      </p>
      <h1>{shown.title}</h1>
      <p className="post__meta">
        <AuthorLink authors={base.authors} nature={on} />
        {date && (
          <>
            {' · '}
            <time dateTime={date.toISOString()}>{date.toLocaleDateString('en-GB', { dateStyle: 'long' })}</time>
          </>
        )}
      </p>
      {on && !edition && (
        <Notice>There is no nature edition of this gazette notification, so here is the original.</Notice>
      )}
      {!on && edition && (
        <Notice>
          This post has a nature edition. <Link href={`/gazette/${slug}/nature`}>Read it in nature mode</Link>.
        </Notice>
      )}
      <FeatureImage post={shown} nature={on} />
      <GhostContent html={shown.html} />
      <div className="post__end">
        <NewsletterWidget />
        <SupportWidget showThanks />
      </div>
    </article>
  );
}
