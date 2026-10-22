import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getNature } from '@/lib/nature';
import { getAuthor, getPostsByAuthor, safely } from '@/lib/ghost';
import { Avatar } from '@/components/AuthorCard';
import { Notice } from '@/components/Notice';
import { PostCard } from '@/components/PostCard';
import { SocialLinks } from '@/components/SocialLinks';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await safely(() => getAuthor(slug), null);
  return { title: data?.name ?? 'Lawmaker' };
}

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

  return (
    <article className="profile">
      {author.cover_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="profile__cover ghost-img" src={author.cover_image} alt="" />
      )}
      <header className="profile__head">
        <Avatar author={author} size={128} />
        <div>
          <p className="eyebrow">Writer</p>
          <h1>{author.name}</h1>
          {author.location && <p className="profile__location">{author.location}</p>}
        </div>
      </header>
      {author.bio && <p className="lede">{author.bio}</p>}
      <SocialLinks author={author} size={24} />
      <section aria-labelledby="posts-heading" className="section">
        <h2 id="posts-heading">Posts</h2>
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
