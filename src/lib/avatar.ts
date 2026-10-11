import manifest from './peeps-manifest.json';

// Open Peeps "bust" layout: where each part sits inside the 1136 × 1533 canvas.
export const BUST = { width: 1136, height: 1533 };
const LAYOUT = {
  body: { x: 147, y: 639, w: 818, h: 733 },
  head: { x: 372, y: 180, w: 473, h: 567 },
  face: { x: 531, y: 366, w: 289, h: 293 },
  'facial-hair': { x: 495, y: 518, w: 280, h: 230 },
  accessories: { x: 419, y: 421, w: 392, h: 138 },
} as const;

export type PartCategory = keyof typeof LAYOUT;
export const PART_ORDER: PartCategory[] = ['body', 'head', 'face', 'facial-hair', 'accessories'];
export const PART_LABELS: Record<PartCategory, string> = {
  head: 'Hair and head',
  face: 'Face',
  'facial-hair': 'Facial hair',
  accessories: 'Accessories',
  body: 'Outfit',
};
export const PARTS = manifest as Record<PartCategory, { id: string; label: string }[]>;

export type AvatarChoice = Record<PartCategory, string>;

export const DEFAULT_AVATAR: AvatarChoice = {
  head: 'afro',
  face: 'smile',
  'facial-hair': 'none',
  accessories: 'none',
  body: 'hoodie',
};

export function randomAvatar(): AvatarChoice {
  const pick = (cat: PartCategory) => {
    const list = PARTS[cat];
    // Keep "none" likely for optional extras so avatars do not get too busy.
    if ((cat === 'facial-hair' || cat === 'accessories') && Math.random() < 0.55) return 'none';
    return list[Math.floor(Math.random() * list.length)].id;
  };
  return Object.fromEntries(PART_ORDER.map((c) => [c, pick(c)])) as AvatarChoice;
}

export function describeAvatar(choice: AvatarChoice) {
  const label = (cat: PartCategory) => PARTS[cat].find((p) => p.id === choice[cat])?.label ?? choice[cat];
  const extras = [
    choice['facial-hair'] !== 'none' && `${label('facial-hair').toLowerCase()} facial hair`,
    choice.accessories !== 'none' && label('accessories').toLowerCase(),
  ].filter(Boolean);
  return `Hand-drawn black and white avatar from the shoulders up: ${label('head').toLowerCase()} hair, ${label('face').toLowerCase()} expression, wearing ${label('body').toLowerCase()}${extras.length ? `, with ${extras.join(' and ')}` : ''}.`;
}

const cache = new Map<string, Promise<string>>();
const loadPart = (cat: PartCategory, id: string) => {
  const key = `${cat}/${id}`;
  if (!cache.has(key)) cache.set(key, fetch(`/peeps/${key}.svg`).then((r) => r.text()));
  return cache.get(key)!;
};

/** Composes the chosen parts into one standalone SVG document. */
export async function composeAvatarSvg(choice: AvatarChoice): Promise<string> {
  const parts = await Promise.all(
    PART_ORDER.map(async (cat) => {
      const { x, y, w, h } = LAYOUT[cat];
      const src = await loadPart(cat, choice[cat]);
      const inner = src
        .replace(/<\?xml[^>]*>/g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<svg[^>]*>/, `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`)
        // Keep ids unique across parts.
        .replace(/id="/g, `id="${cat}-`)
        .replace(/url\(#/g, `url(#${cat}-`)
        .replace(/href="#/g, `href="#${cat}-`);
      return inner;
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${BUST.width}" height="${BUST.height}" viewBox="0 0 ${BUST.width} ${BUST.height}">${parts.join('')}</svg>`;
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
