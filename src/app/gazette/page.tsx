import type { Metadata } from 'next';
import Link from 'next/link';
import { getNature } from '@/lib/nature';
import { getGazette } from '@/lib/gazette';
import { safely } from '@/lib/ghost';
import { Art } from '@/components/Art';
import { NewsletterWidget } from '@/components/NewsletterWidget';
import { Notice } from '@/components/Notice';
import { PostCard } from '@/components/PostCard';

export const metadata: Metadata = { title: 'Gazette of Closet Republic' };

const PER_PAGE = 12;

export default async function GazettePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { on } = await getNature();
  const { data: gazette, problem } = await safely(() => getGazette(on), []);
  const pages = Math.max(1, Math.ceil(gazette.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number((await searchParams).page) || 1));
  const items = gazette.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <>
      <NewsletterWidget />
      <header className="page-head">
        <div>
          <h1>{on ? 'Gazette of Closet Republic' : 'Blog'}</h1>
          <p className="lede">
            {on
              ? 'Official notifications, decrees and dispatches of the Government of Closet Republic.'
              : 'Every post from Closet Republic, newest first.'}
          </p>
        </div>
        <Art name="new-beginnings" nature={on} className="page-head__art" />
      </header>
      {problem && <Notice tone="warn">{problem}</Notice>}
      {!problem && gazette.length === 0 && <Notice>No posts have been published yet.</Notice>}
      <div className="card-grid">
        {items.map((g) => (
          <PostCard key={g.base.id} post={g.shown} base={g.base} nature={on} />
        ))}
      </div>
      {pages > 1 && (
        <nav aria-label="Gazette pages" className="pager">
          {page > 1 && <Link href={`/gazette?page=${page - 1}`}>Newer</Link>}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages && <Link href={`/gazette?page=${page + 1}`}>Older</Link>}
        </nav>
      )}
    </>
  );
}
