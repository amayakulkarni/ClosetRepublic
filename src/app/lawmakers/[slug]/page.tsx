import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getNature } from '@/lib/nature';
import { getAuthor, getPostsByAuthor, safely } from '@/lib/ghost';
import { Avatar } from '@/components/AuthorCard';
import { Notice } from '@/components/Notice';
import { PostCard } from '@/components/PostCard';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await safely(() => getAuthor(slug), null);
  return { title: data?.name ?? 'Lawmaker' };
}

const twitterUrl = (handle: string) => `https://x.com/${handle.replace(/^@/, '')}`;
const facebookUrl = (handle: string) => `https://www.facebook.com/${handle}`;

export default async function LawmakerPage({ params }: Props) {
  const { slug } = await params;
  const { on } = await getNature();
  const { data, problem } = await safely(
    async () => {
      const [author, posts] = await Promise.all([getAuthor(slug), getPostsByAuthor(slug)]);
      return { author, posts };
    },
    { author: null, posts: [] },
  );
  if (problem) return <Notice tone="warn">{problem}</Notice>;
  const { author, posts } = data;
  if (!author) notFound();

  const links = [
    author.website && { href: author.website, label: 'Website' },
    author.twitter && { href: twitterUrl(author.twitter), label: `X (Twitter): ${author.twitter}` },
    author.facebook && { href: facebookUrl(author.facebook), label: 'Facebook' },
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <article className="profile">
      {author.cover_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="profile__cover ghost-img" src={author.cover_image} alt="" />
      )}
      <header className="profile__head">
        <Avatar author={author} size={128} />
        <div>
          <p className="eyebrow">{on ? 'Member of the GCR' : 'Writer'}</p>
          <h1>{on ? `Hon. ${author.name}` : author.name}</h1>
          {author.location && <p className="profile__location">{on ? `Constituency: ${author.location}` : author.location}</p>}
        </div>
      </header>
      {author.bio && <p className="lede">{author.bio}</p>}
      {links.length > 0 && (
        <ul className="link-list">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noopener noreferrer me">
                {l.label}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <section aria-labelledby="posts-heading" className="section">
        <h2 id="posts-heading">{on ? 'Gazette notifications issued' : 'Posts'}</h2>
        {posts.length === 0 ? (
          <p>Nothing published yet.</p>
        ) : (
          <div className="card-grid">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} nature={on} />
            ))}
          </div>
        )}
      </section>
    </article>
  );
}
