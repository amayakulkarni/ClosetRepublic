import Link from 'next/link';
import type { GhostAuthor } from '@/lib/ghost';

export function AuthorLink({ authors, nature }: { authors?: GhostAuthor[]; nature: boolean }) {
  if (!authors?.length) return null;
  return (
    <span className="author-link">
      {nature ? 'Issued by ' : 'By '}
      {authors.map((a, i) => (
        <span key={a.id}>
          {i > 0 && (i === authors.length - 1 ? ' and ' : ', ')}
          <Link href={`/lawmakers/${a.slug}`}>
            {nature ? `Hon. ${a.name}` : a.name}
          </Link>
        </span>
      ))}
    </span>
  );
}
