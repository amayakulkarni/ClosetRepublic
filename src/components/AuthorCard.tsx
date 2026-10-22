import Link from 'next/link';
import type { GhostAuthor } from '@/lib/ghost';
import { SocialLinks } from './SocialLinks';

export function Avatar({ author, size = 72 }: { author: GhostAuthor; size?: number }) {
  if (!author.profile_image) {
    return (
      <span className="avatar avatar--initial" style={{ width: size, height: size }} aria-hidden="true">
        {author.name.charAt(0)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="avatar ghost-img" src={author.profile_image} alt="" width={size} height={size} />
  );
}

export function AuthorCard({ author, nature, cta }: { author: GhostAuthor; nature: boolean; cta?: string }) {
  return (
    <article className="author-card">
      <Avatar author={author} />
      <div>
        <h3>
          <Link href={`/lawmakers/${author.slug}`}>{author.name}</Link>
        </h3>
        {author.bio && <p className="author-card__bio">{author.bio}</p>}
        <SocialLinks author={author} />
        {cta && (
          <Link className="author-card__cta" href={`/lawmakers/${author.slug}`}>
            {cta}
            <span className="sr-only"> for {author.name}</span>
          </Link>
        )}
      </div>
    </article>
  );
}
