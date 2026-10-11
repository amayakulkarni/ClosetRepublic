import type { Metadata } from 'next';
import { getNature } from '@/lib/nature';
import { getSections, getSection } from '@/lib/constitution';
import { safely } from '@/lib/ghost';
import { Art } from '@/components/Art';
import { ConstitutionView } from '@/components/ConstitutionView';
import { Notice } from '@/components/Notice';

export const metadata: Metadata = { title: 'Constitution of CR' };

export default async function ConstitutionIndex() {
  const { on } = await getNature();
  const { data, problem } = await safely(
    async () => ({ ...(await getSection([])), ...(await getSections([])) }),
    { entry: null, edition: null, count: null, sections: [] },
  );
  if (problem) return <Notice tone="warn">{problem}</Notice>;
  return (
    <>
      <Art name="growth" nature={on} className="page-head__art page-head__art--float" />
      <ConstitutionView path={[]} nature={on} fallbackTitle="Constitution of Closet Republic" {...data} />
    </>
  );
}
