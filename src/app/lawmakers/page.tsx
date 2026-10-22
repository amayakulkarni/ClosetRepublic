import type { Metadata } from 'next';
import { getNature } from '@/lib/nature';
import { getAuthors, safely } from '@/lib/ghost';
import { Art } from '@/components/Art';
import { AuthorCard } from '@/components/AuthorCard';
import { Notice } from '@/components/Notice';

export const metadata: Metadata = { title: 'Members of GCR' };

export default async function LawmakersPage() {
  const { on } = await getNature();
  const { data: authors, problem } = await safely(getAuthors, []);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Writers</h1>
          <p className="lede">
            The people who write for Closet Republic.
          </p>
        </div>
        <Art name="chaotic-good" nature={on} className="page-head__art" />
      </header>
      {problem && <Notice tone="warn">{problem}</Notice>}
      <div className="card-grid">
        {authors.map((a) => (
          <AuthorCard key={a.id} author={a} nature={on} />
        ))}
      </div>
    </>
  );
}
