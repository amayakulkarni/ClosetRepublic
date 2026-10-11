import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getNature } from '@/lib/nature';
import { getSections, getSection, slugFor } from '@/lib/constitution';
import { countFrom, getEntry, safely } from '@/lib/ghost';
import { ConstitutionView } from '@/components/ConstitutionView';
import { GhostContent } from '@/components/GhostContent';
import { Notice } from '@/components/Notice';

type Props = { params: Promise<{ path: string[] }> };

const validPath = (path: string[]) =>
  path.every((p, i) => /^\d+$/.test(p) || (p === 'details' && i === path.length - 1));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  return { title: `Constitution · Section ${path.filter((p) => p !== 'details').join('.') || 'details'}` };
}

export default async function ConstitutionSection({ params }: Props) {
  const { path } = await params;
  if (!validPath(path)) notFound();
  const { on } = await getNature();

  // /constitution/details and /constitution/1/details: how many sections there are.
  if (path[path.length - 1] === 'details') {
    const parent = path.slice(0, -1);
    const { data: entry, problem } = await safely(() => getEntry(`${slugFor(parent)}-details`), null);
    if (problem) return <Notice tone="warn">{problem}</Notice>;
    if (!entry) notFound();
    const count = countFrom(entry);
    const where = parent.length ? `Section ${parent.join('.')}` : 'The constitution';
    return (
      <article className="post">
        <p className="eyebrow">
          <Link href={`/constitution/${parent.join('/')}`}>{where}</Link>
        </p>
        <h1>{entry.title}</h1>
        {count !== null && (
          <p className="lede">
            {where} has exactly {count} {count === 1 ? 'section' : 'sections'}.
          </p>
        )}
        <GhostContent html={entry.html} />
      </article>
    );
  }

  const { data, problem } = await safely(
    async () => ({ ...(await getSection(path)), ...(await getSections(path)) }),
    { entry: null, edition: null, count: null, sections: [] },
  );
  if (problem) return <Notice tone="warn">{problem}</Notice>;
  if (!data.entry && !data.edition && data.sections.length === 0) notFound();
  return <ConstitutionView path={path} nature={on} fallbackTitle={`Section ${path.join('.')}`} {...data} />;
}
