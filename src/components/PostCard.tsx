import Link from 'next/link';
import { excerptOf, type GhostPost } from '@/lib/ghost';
import { AuthorLink } from './AuthorLink';

export function PostCard({ post, base, nature }: { post: GhostPost; base?: GhostPost; nature: boolean }) {
  // `post` is what gets shown (maybe the nature edition); `base` is the gazette entry it belongs to.
  const href = `/gazette/${(base ?? post).slug}`;
  return (
    <article className="post-card">
      <h3 className="post-card__title">
        <Link href={href}>{post.title}</Link>
      </h3>
      {excerptOf(post) && <p className="post-card__excerpt">{excerptOf(post)}</p>}
      <p className="post-card__meta">
        <AuthorLink authors={(base ?? post).authors} nature={nature} />
      </p>
    </article>
  );
}
