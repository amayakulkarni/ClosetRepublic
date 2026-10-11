// Black-on-white line illustrations, inverted to white-on-black so the prism can split them.
const ART = {
  'mechanical-love': 'Two people in oversized jackets lean their heads together in a warm embrace',
  'new-beginnings': 'A person curled up in an armchair, reading a newspaper',
  growth: 'A person with big curly hair sits cross-legged on the floor, reading a book beside a stack of books',
  consumer: 'A person strolls along carrying shopping bags',
  'chaotic-good': 'A person in a fluffy coat and short skirt strides forward confidently',
  'walking-contradiction': 'A person with a prosthetic leg walks along with a backpack',
  pondering: 'A person with a prosthetic leg stands with a backpack, lost in thought',
  'looking-ahead': 'A person kneels on one knee and looks ahead, ready to stand up',
  reflecting: 'A person hugs their knees and smiles to themselves',
} as const;

export type ArtName = keyof typeof ART;

export function Art({ name, className = '', nature }: { name: ArtName; className?: string; nature: boolean }) {
  const effect = nature
    ? ' Drawn in white lines on black; where it meets the prism at the screen edges or under your pointer, the white lines split into rainbow colours.'
    : ' Drawn in white lines on black.';
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/art/${name}.svg`} alt={`Illustration: ${ART[name]}.${effect}`} className={`art ${className}`} loading="lazy" />
  );
}
