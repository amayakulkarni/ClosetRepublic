// Social links for a lawmaker or writer: the website and Facebook handle from Ghost, plus any link written in the bio.
// Major platforms are shown as a logo only; anything else is a plain website link. Twitter / X links are never shown.

export type Social = { href: string; network: string; label: string };

const SKIP = /(^|\.)(twitter\.com|x\.com|t\.co|nitter\.net)$/i;

const NETWORKS: [RegExp, string, string][] = [
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/i, 'facebook', 'Facebook'],
  [/(^|\.)instagram\.com$/i, 'instagram', 'Instagram'],
  [/(^|\.)(youtube\.com|youtu\.be)$/i, 'youtube', 'YouTube'],
  [/(^|\.)linkedin\.com$/i, 'linkedin', 'LinkedIn'],
  [/(^|\.)github\.com$/i, 'github', 'GitHub'],
  [/(^|\.)gitlab\.com$/i, 'gitlab', 'GitLab'],
  [/(^|\.)codeberg\.org$/i, 'codeberg', 'Codeberg'],
  [/(^|\.)reddit\.com$/i, 'reddit', 'Reddit'],
  [/(^|\.)tiktok\.com$/i, 'tiktok', 'TikTok'],
  [/(^|\.)bsky\.app$/i, 'bluesky', 'Bluesky'],
  [/(^|\.)threads\.(net|com)$/i, 'threads', 'Threads'],
  [/(^|\.)pinterest\.[a-z.]+$/i, 'pinterest', 'Pinterest'],
  [/(^|\.)twitch\.tv$/i, 'twitch', 'Twitch'],
  [/(^|\.)(discord\.gg|discord\.com)$/i, 'discord', 'Discord'],
  [/(^|\.)(t\.me|telegram\.me)$/i, 'telegram', 'Telegram'],
  [/(^|\.)(wa\.me|whatsapp\.com)$/i, 'whatsapp', 'WhatsApp'],
  [/(^|\.)medium\.com$/i, 'medium', 'Medium'],
  [/(^|\.)substack\.com$/i, 'substack', 'Substack'],
  [/(^|\.)tumblr\.com$/i, 'tumblr', 'Tumblr'],
  [/(^|\.)snapchat\.com$/i, 'snapchat', 'Snapchat'],
  [/(^|\.)patreon\.com$/i, 'patreon', 'Patreon'],
  [/(^|\.)ko-fi\.com$/i, 'kofi', 'Ko-fi'],
  [/(^|\.)buymeacoffee\.com$/i, 'buymeacoffee', 'Buy Me a Coffee'],
  [/(^|\.)spotify\.com$/i, 'spotify', 'Spotify'],
  [/(^|\.)behance\.net$/i, 'behance', 'Behance'],
  [/(^|\.)dribbble\.com$/i, 'dribbble', 'Dribbble'],
  [/(^|\.)(mastodon\.[a-z]+|mas\.to|hachyderm\.io|fosstodon\.org)$/i, 'mastodon', 'Mastodon'],
];

function parse(raw: string): URL | null {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** One link to its network, or null when it must not be shown (Twitter / X, or not a web address). */
export function classify(raw: string): Social | null {
  const url = parse(raw.trim());
  if (!url || !url.hostname.includes('.')) return null;
  const host = url.hostname.toLowerCase();
  if (SKIP.test(host)) return null;
  const hit = NETWORKS.find(([re]) => re.test(host));
  // A profile address like https://example.social/@name is a Mastodon-style account.
  const network = hit?.[1] ?? (/^\/@[^/]+/.test(url.pathname) ? 'mastodon' : 'website');
  const label = hit?.[2] ?? (network === 'mastodon' ? 'Mastodon' : host.replace(/^www\./, ''));
  return { href: url.toString(), network, label };
}

const facebookUrl = (handle: string) => (/^https?:\/\//i.test(handle) ? handle : `https://www.facebook.com/${handle.replace(/^\/+/, '')}`);

/** Every shown link, once each, in this order: website, Facebook, then links found in the bio. The Twitter field is ignored. */
export function socialLinks(author: { website?: string | null; facebook?: string | null; twitter?: string | null; bio?: string | null }): Social[] {
  const candidates: string[] = [];
  if (author.website) candidates.push(author.website);
  if (author.facebook) candidates.push(facebookUrl(author.facebook));
  for (const m of (author.bio ?? '').matchAll(/https?:\/\/[^\s<>"']+/gi)) candidates.push(m[0].replace(/[.,;:!?)\]]+$/, ''));
  const seen = new Set<string>();
  const out: Social[] = [];
  for (const c of candidates) {
    const s = classify(c);
    if (!s) continue;
    const u = new URL(s.href);
    const key = `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
