import { BRAND_PATHS } from '@/lib/social-paths';
import { socialLinks } from '@/lib/socials';
import type { GhostAuthor } from '@/lib/ghost';

// LinkedIn's mark is not in the open icon set, so this is a plain "in" glyph.
const LINKEDIN = 'M3.5 9h4v11h-4zM5.5 3.2a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6zM10 9h3.8v1.6c.6-1 1.9-1.9 3.8-1.9 3.6 0 4.4 2.3 4.4 5.4V20h-4v-5.2c0-1.3 0-2.9-1.8-2.9s-2.2 1.4-2.2 2.8V20h-4z';
const GLOBE = 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 9h-3a15.7 15.7 0 0 0-1.2-5.2A8 8 0 0 1 18.9 11zM12 4c.8 1 1.7 3 2 7h-4c.3-4 1.2-6 2-7zM4.1 13h3a15.7 15.7 0 0 0 1.2 5.2A8 8 0 0 1 4.1 13zm3-2h-3a8 8 0 0 1 4.2-5.2A15.7 15.7 0 0 0 7.1 11zM12 20c-.8-1-1.7-3-2-7h4c-.3 4-1.2 6-2 7zm2.7-1.8c.7-1.4 1.1-3.2 1.2-5.2h3a8 8 0 0 1-4.2 5.2z';

const pathFor = (network: string) => (network === 'linkedin' ? LINKEDIN : network === 'website' ? GLOBE : BRAND_PATHS[network] ?? GLOBE);

/** Round logo-only links for every social profile of an author. Renders nothing when there are none. */
export function SocialLinks({ author, size = 20 }: { author: GhostAuthor; size?: number }) {
  const links = socialLinks(author);
  if (!links.length) return null;
  return (
    <ul className="social-links" aria-label={`Links for ${author.name}`}>
      {links.map((l) => (
        <li key={l.href}>
          <a href={l.href} target="_blank" rel="noopener noreferrer me" title={l.label} aria-label={`${l.label} (opens in a new tab)`}>
            <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
              <path d={pathFor(l.network)} />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
