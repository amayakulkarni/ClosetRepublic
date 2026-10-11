import type { GhostPost } from '@/lib/ghost';

export function FeatureImage({ post, nature }: { post: GhostPost; nature: boolean }) {
  if (!post.feature_image) return null;
  const alt = post.feature_image_alt || `Cover image for “${post.title}”`;
  const effect = nature ? '' : ' Shown in black and white.';
  return (
    <figure className="feature-image">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={post.feature_image} alt={`${alt}.${effect}`} className="ghost-img" />
      {post.feature_image_caption && <figcaption dangerouslySetInnerHTML={{ __html: post.feature_image_caption }} />}
    </figure>
  );
}
