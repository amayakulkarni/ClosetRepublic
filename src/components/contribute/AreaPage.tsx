import { getNature } from '@/lib/nature';
import { communityLinks } from '@/lib/community';
import { AREA_LABEL, type ContributionArea } from '@/lib/contribution-areas';
import { CommunityNote } from './CommunityNote';
import { ContributorForm } from './ContributorForm';

const COPY: Record<ContributionArea, { work: string; plain: string; nature: string; looking: string[] }> = {
  constitution: {
    work: 'writing',
    plain: 'Help shape the constitution of Closet Republic: its articles, its wording and its playful legal voice.',
    nature: 'The Constitutional Assembly is recruiting drafters. Experience with legal writing, policy or very long sentences is welcome.',
    looking: ['People who enjoy legal or policy writing', 'Careful editors who can make articles clearer and kinder', 'Translators for other languages'],
  },
  writing: {
    work: 'writing',
    plain: 'Write for the Gazette: news from the Republic, essays, stories and satire.',
    nature: 'The Gazette Press is hiring correspondents. Decrees, dispatches and opinion columns are all in its remit.',
    looking: ['Essayists and storytellers', 'Satire and parody writers', 'People with lived experience they want to write about'],
  },
  art: {
    work: 'artwork',
    plain: 'Make art for the Republic: illustrations, icons, stamps for the passport and nature-mode effects.',
    nature: 'The Ministry of Arts commissions murals for the national walls, stamps for the passport and the occasional flag.',
    looking: ['Illustrators, especially line art that works in white on black', 'Designers for passport stamps and icons', 'Motion and effects artists for nature mode'],
  },
};

export async function AreaPage({ area }: { area: ContributionArea }) {
  const { on } = await getNature();
  const c = COPY[area];
  const label = on ? AREA_LABEL[area].nature : AREA_LABEL[area].plain;
  return (
    <>
      <section aria-labelledby="area-heading" className="section">
        <h2 id="area-heading">{label}</h2>
        <p>{on ? c.nature : c.plain}</p>
        <h3>We are looking for</h3>
        <ul className="plain-list">
          {c.looking.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <CommunityNote links={communityLinks()} work={c.work} />

      <section aria-labelledby="form-heading" className="section">
        <h2 id="form-heading">{on ? 'Apply to serve' : 'Get in touch'}</h2>
        <p>Leave your contact details and a link to your public work. We will reply by email after checking the link.</p>
        <ContributorForm area={area} work={c.work} />
      </section>
    </>
  );
}
