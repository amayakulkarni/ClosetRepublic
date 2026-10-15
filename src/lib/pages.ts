import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';

// The About and legal pages are Markdown files in content/pages, so they can be edited
// without touching code. {{TOKENS}} in them are filled in from LEGAL_* env variables.

export const PAGE_SLUGS = ['about', 'terms', 'privacy', 'guidelines'] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];

/** Change this when the legal text changes (or set LEGAL_UPDATED). */
const LAST_UPDATED = '15 October 2026';

const DIR = path.join(process.cwd(), 'content', 'pages');
const marked = new Marked({ gfm: true });

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function legalEmail() {
  return process.env.LEGAL_EMAIL || process.env.MAIL_REPLY_TO || process.env.CONTRIBUTIONS_EMAIL || '';
}

function tokens(): Record<string, string> {
  const email = legalEmail();
  const address = process.env.LEGAL_POSTAL_ADDRESS?.trim();
  const country = process.env.LEGAL_COUNTRY || 'India';
  return {
    UPDATED: escape(process.env.LEGAL_UPDATED || LAST_UPDATED),
    OPERATOR: escape(process.env.LEGAL_OPERATOR || 'the founders of Closet Republic'),
    EMAIL: email ? `[${escape(email)}](mailto:${encodeURIComponent(email).replace(/%40/g, '@')})` : '(contact email not set: add LEGAL_EMAIL)',
    POSTAL_SENTENCE: address ? ` Our postal address is ${escape(address)}.` : '',
    POSTAL_LINE: address ? `<br>\nPost: ${escape(address)}` : '',
    COUNTRY: escape(country),
    SERVER_COUNTRY: escape(process.env.LEGAL_SERVER_COUNTRY || country),
  };
}

export type Page = { title: string; description: string; html: string };

export function getPage(slug: PageSlug): Page {
  const raw = fs.readFileSync(path.join(DIR, `${slug}.md`), 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = Object.fromEntries(
    (match?.[1] ?? '').split('\n').map((line) => {
      const i = line.indexOf(':');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
  );
  const t = tokens();
  const body = (match ? raw.slice(match[0].length) : raw)
    // The page head already shows the title.
    .replace(/^\s*# .*\n/, '')
    .replace(/\{\{([A-Z_]+)\}\}/g, (all, key: string) => t[key] ?? all);
  return { title: meta.title || slug, description: meta.description || '', html: marked.parse(body) as string };
}
