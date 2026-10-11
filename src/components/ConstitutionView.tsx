import Link from 'next/link';
import type { GhostPost } from '@/lib/ghost';
import type { SectionLink } from '@/lib/constitution';
import { GhostContent } from './GhostContent';
import { Notice } from './Notice';

type Props = {
  path: string[];
  entry: GhostPost | null;
  edition: GhostPost | null;
  nature: boolean;
  sections: SectionLink[];
  count: number | null;
  fallbackTitle: string;
};

export function ConstitutionView({ path, entry, edition, nature, sections, count, fallbackTitle }: Props) {
  const shown = nature && edition ? edition : entry;
  const label = path.length === 0 ? 'Sections' : 'Sub-sections';
  return (
    <article className="post constitution">
      <nav aria-label="Breadcrumb" className="eyebrow">
        <Link href="/constitution">Constitution of CR</Link>
        {path.map((_, i) => (
          <span key={i}>
            {' / '}
            <Link href={`/constitution/${path.slice(0, i + 1).join('/')}`}>Section {path.slice(0, i + 1).join('.')}</Link>
          </span>
        ))}
        {nature && edition && ' · Nature edition'}
      </nav>
      <h1>{shown?.title ?? fallbackTitle}</h1>
      {nature && entry && !edition && <Notice>There is no nature edition of this part of the constitution, so here is the original.</Notice>}
      {!entry && <Notice>This part of the constitution has not been published yet.</Notice>}
      <GhostContent html={shown?.html} />

      {sections.length > 0 && (
        <section aria-labelledby="sections-heading" className="section">
          <h2 id="sections-heading">
            {label}
            {count ? ` (${count})` : ''}
          </h2>
          <ol className="section-list">
            {sections.map((c) => (
              <li key={c.number}>
                <Link href={`/constitution/${c.path.join('/')}`}>
                  <span className="section-list__num">{c.path.join('.')}</span>
                  <span>{c.title ?? 'Not yet published'}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
