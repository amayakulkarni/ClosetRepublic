import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, type RGB } from 'pdf-lib';
import { buildMrz } from './mrz';

// Builds the printable CR passport: a 24-page booklet imposed on three duplex A4 sheets.
//
// Each passport page is 78 × 115 mm (1 cm smaller than a real 88 × 125 mm passport).
// Each A4 side holds two spreads (four passport pages); each spread is cut out, folded
// in the middle and nested into the booklet. Folio i (0 = outermost) carries pages
// 2i+1, 2i+2, P-2i-1 and P-2i, printed as [P-2i | 2i+1] on the front and
// [2i+2 | P-2i-1] on the back (duplex, flip on long edge).
//
//   Sheet 1 (covers, photo paper friendly)  front: [24 | 1]  [22 | 3]   back: [2 | 23]  [4 | 21]
//   Sheet 2 (stamps)                        front: [20 | 5]  [18 | 7]   back: [6 | 19]  [8 | 17]
//   Sheet 3 (stamps)                        front: [16 | 9]  [14 | 11]  back: [10 | 15] [12 | 13]

export type PassportData = {
  givenNames: string;
  surname: string;
  genderIdentity: string;
  sexMarker: 'F' | 'M' | 'X';
  pronouns: string;
  dateOfBirth: string; // yyyy-mm-dd, or empty when left out
  placeOfBirth: string;
  maritalStatus: string;
  spouseName: string;
  address: string;
  photo: { bytes: Uint8Array; type: 'png' | 'jpg' };
  logoWhite: Uint8Array; // PNG
  logoBlack: Uint8Array; // PNG
};

const MM = 72 / 25.4;
const mm = (v: number) => v * MM;

const A4 = { w: 210, h: 297 };
const PAGE = { w: 78, h: 115 };
const SPREAD_X = (A4.w - PAGE.w * 2) / 2;
const SPREAD_Y = [A4.h - 22 - PAGE.h, 22]; // top spread, bottom spread (from the bottom edge)
const BLEED = 3;
const TOTAL_PAGES = 24;

const COVER = rgb(0.07, 0.07, 0.08);
const INK = rgb(0.08, 0.08, 0.1);
const GREY = rgb(0.45, 0.45, 0.48);
const LIGHT = rgb(0.86, 0.86, 0.88);
const WHITE = rgb(1, 1, 1);

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont; mono: PDFFont };
type Ctx = {
  doc: PDFDocument;
  fonts: Fonts;
  photo: PDFImage;
  logoWhite: PDFImage;
  logoBlack: PDFImage;
  data: PassportData;
  passportNo: string;
  issued: Date;
  expires: Date;
  mrz: [string, string];
};
type Box = { page: PDFPage; x: number; y: number }; // bottom-left corner of a passport page, in mm

// ---------- text helpers ----------

const encodable = new Map<string, boolean>();
/** Standard PDF fonts only cover Latin-1, so strip accents and replace anything else with "?". */
function safe(font: PDFFont, text: string) {
  return [...text.normalize('NFC')]
    .map((ch) => {
      const key = `${font.name}:${ch}`;
      if (!encodable.has(key)) {
        try {
          font.widthOfTextAtSize(ch, 10);
          encodable.set(key, true);
        } catch {
          encodable.set(key, false);
        }
      }
      if (encodable.get(key)) return ch;
      const stripped = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      try {
        font.widthOfTextAtSize(stripped, 10);
        return stripped;
      } catch {
        return '?';
      }
    })
    .join('');
}

function text(b: Box, s: string, x: number, y: number, size: number, font: PDFFont, color: RGB = INK, opts: { align?: 'left' | 'center' | 'right'; spacing?: number } = {}) {
  const str = safe(font, s);
  const spacing = opts.spacing ?? 0;
  const width = font.widthOfTextAtSize(str, size) + spacing * Math.max(0, str.length - 1);
  let px = mm(b.x + x);
  if (opts.align === 'center') px -= width / 2;
  if (opts.align === 'right') px -= width;
  if (!spacing) {
    b.page.drawText(str, { x: px, y: mm(b.y + y), size, font, color });
    return;
  }
  for (const ch of str) {
    b.page.drawText(ch, { x: px, y: mm(b.y + y), size, font, color });
    px += font.widthOfTextAtSize(ch, size) + spacing;
  }
}

function wrap(font: PDFFont, s: string, size: number, maxWidthMm: number) {
  const lines: string[] = [];
  for (const para of s.split(/\r?\n/).map((l) => safe(font, l))) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > mm(maxWidthMm) && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

function paragraph(b: Box, s: string, x: number, top: number, width: number, size: number, font: PDFFont, color: RGB = INK, leading = 1.35) {
  const lines = wrap(font, s, size, width);
  const step = (size * leading) / MM;
  lines.forEach((line, i) => text(b, line, x, top - i * step, size, font, color));
  return top - lines.length * step;
}

function rule(b: Box, x1: number, y: number, x2: number, color: RGB = LIGHT, thickness = 0.5) {
  b.page.drawLine({ start: { x: mm(b.x + x1), y: mm(b.y + y) }, end: { x: mm(b.x + x2), y: mm(b.y + y) }, thickness, color });
}

const fmtDate = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, '0')} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase()} ${d.getUTCFullYear()}`;

function field(b: Box, label: string, value: string, x: number, y: number, ctx: Ctx, width = 40) {
  text(b, label.toUpperCase(), x, y, 4.6, ctx.fonts.regular, GREY);
  const lines = wrap(ctx.fonts.bold, value || '-', 7, width).slice(0, 2);
  lines.forEach((l, i) => text(b, l, x, y - 3 - i * 3, 7, ctx.fonts.bold));
  return y - 3 - lines.length * 3 - 2.2;
}

function pageNumber(b: Box, n: number, ctx: Ctx) {
  text(b, String(n), PAGE.w / 2, 4, 6, ctx.fonts.regular, GREY, { align: 'center' });
}

// ---------- the pages ----------

function cover(b: Box, ctx: Ctx, side: 'left' | 'right', front: boolean) {
  // Covers bleed past the trim on every edge except the fold.
  const left = side === 'left' ? BLEED : 0;
  const right = side === 'right' ? BLEED : 0;
  b.page.drawRectangle({
    x: mm(b.x - left),
    y: mm(b.y - BLEED),
    width: mm(PAGE.w + left + right),
    height: mm(PAGE.h + BLEED * 2),
    color: COVER,
  });
  if (!front) return;
  text(b, 'CLOSET REPUBLIC', PAGE.w / 2, PAGE.h - 20, 12, ctx.fonts.bold, WHITE, { align: 'center', spacing: 1.6 });
  const size = 30;
  b.page.drawImage(ctx.logoWhite, { x: mm(b.x + (PAGE.w - size) / 2), y: mm(b.y + PAGE.h / 2 - size / 2 + 2), width: mm(size), height: mm(size) });
  text(b, 'PASSPORT', PAGE.w / 2, 30, 10, ctx.fonts.bold, WHITE, { align: 'center', spacing: 2.4 });
  text(b, 'Naturally exceptional', PAGE.w / 2, 14, 6.5, ctx.fonts.italic, WHITE, { align: 'center' });
}

function agreement(b: Box, ctx: Ctx) {
  const name = `${ctx.data.givenNames} ${ctx.data.surname}`.trim();
  text(b, 'AGREEMENT', PAGE.w / 2, PAGE.h - 14, 9, ctx.fonts.bold, INK, { align: 'center', spacing: 1.2 });
  text(b, 'between the bearer and the Government of Closet Republic', PAGE.w / 2, PAGE.h - 19, 5.6, ctx.fonts.italic, GREY, { align: 'center' });
  let y = PAGE.h - 28;
  y = paragraph(b, `1. The bearer of this passport, ${name}, is bound to uphold the Constitution of Closet Republic, to respect the Fundamental Human Rights of fellow humans set out in Part 2 of it, and to live their life truthfully, without forcing a false identity on themselves.`, 7, y, PAGE.w - 14, 6.3, ctx.fonts.regular);
  y = paragraph(b, '2. The Government of Closet Republic (GCR) agrees to protect and assist the bearer for as long as the bearer abides by the Constitution of CR.', 7, y - 2.5, PAGE.w - 14, 6.3, ctx.fonts.regular);
  y = paragraph(b, `3. Issued on ${fmtDate(ctx.issued)} and valid until ${fmtDate(ctx.expires)}.`, 7, y - 2.5, PAGE.w - 14, 6.3, ctx.fonts.regular);

  rule(b, 7, 30, 35, GREY);
  rule(b, 43, 30, 71, GREY);
  text(b, 'Signature of the bearer', 7, 26.5, 5, ctx.fonts.regular, GREY);
  text(b, 'For the GCR', 43, 26.5, 5, ctx.fonts.regular, GREY);
  b.page.drawImage(ctx.logoBlack, { x: mm(b.x + 52), y: mm(b.y + 32), width: mm(9), height: mm(9), opacity: 0.85 });

  paragraph(b, 'A commemorative document of Closet Republic, an online community and parody nation. It is not a government identity or travel document.', 7, 16, PAGE.w - 14, 4.6, ctx.fonts.italic, GREY);
  pageNumber(b, 2, ctx);
}

function idHeader(b: Box, ctx: Ctx, title: string) {
  b.page.drawImage(ctx.logoBlack, { x: mm(b.x + 5), y: mm(b.y + PAGE.h - 11), width: mm(6), height: mm(6) });
  text(b, 'CLOSET REPUBLIC', 13, PAGE.h - 7.6, 7, ctx.fonts.bold, INK, { spacing: 0.6 });
  text(b, title, 13, PAGE.h - 10.6, 5, ctx.fonts.regular, GREY);
  rule(b, 5, PAGE.h - 13.5, PAGE.w - 5, INK, 0.6);
}

function guilloche(b: Box, top: number, bottom: number) {
  // Fine wavy security pattern, very light so stamps and text stay readable.
  for (let k = 0; k < 9; k++) {
    let d = '';
    const amp = 2.2 + (k % 3);
    const base = bottom + ((top - bottom) * (k + 0.5)) / 9;
    for (let i = 0; i <= 120; i++) {
      const xx = 4 + ((PAGE.w - 8) * i) / 120;
      const yy = base + Math.sin(i / 6 + k) * amp + Math.sin(i / 17 + k * 2) * amp * 0.6;
      d += `${i ? 'L' : 'M'}${mm(xx).toFixed(2)} ${(-mm(yy)).toFixed(2)} `;
    }
    b.page.drawSvgPath(d, { x: mm(b.x), y: mm(b.y), borderColor: rgb(0.9, 0.9, 0.92), borderWidth: 0.35 });
  }
}

function idPage(b: Box, ctx: Ctx) {
  const d = ctx.data;
  idHeader(b, ctx, 'PASSPORT · IDENTITY PAGE');
  guilloche(b, PAGE.h - 16, 26);

  // Photo
  const photo = { x: 5, y: PAGE.h - 51, w: 27, h: 34.7 };
  b.page.drawImage(ctx.photo, { x: mm(b.x + photo.x), y: mm(b.y + photo.y), width: mm(photo.w), height: mm(photo.h) });
  b.page.drawRectangle({ x: mm(b.x + photo.x), y: mm(b.y + photo.y), width: mm(photo.w), height: mm(photo.h), borderColor: INK, borderWidth: 0.4 });

  // Fields
  const col = 35;
  text(b, 'TYPE', col, PAGE.h - 18, 4.6, ctx.fonts.regular, GREY);
  text(b, 'P', col, PAGE.h - 21, 7, ctx.fonts.bold);
  text(b, 'CODE', col + 9, PAGE.h - 18, 4.6, ctx.fonts.regular, GREY);
  text(b, 'CRP', col + 9, PAGE.h - 21, 7, ctx.fonts.bold);
  text(b, 'PASSPORT NO.', col + 20, PAGE.h - 18, 4.6, ctx.fonts.regular, GREY);
  text(b, ctx.passportNo, col + 20, PAGE.h - 21, 7, ctx.fonts.bold);
  let y = PAGE.h - 25.5;
  y = field(b, 'Surname', d.surname.toUpperCase(), col, y, ctx, 38);
  y = field(b, 'Given names', d.givenNames.toUpperCase(), col, y, ctx, 38);
  y = field(b, 'Nationality', 'CITIZEN OF CLOSET REPUBLIC', col, y, ctx, 38);
  y = field(b, 'Date of birth', d.dateOfBirth ? fmtDate(new Date(`${d.dateOfBirth}T00:00:00Z`)) : '-', col, y, ctx, 38);
  field(b, 'Sex', d.sexMarker, col + 27, y + 7.2, ctx, 10);
  y = field(b, 'Place of birth', (d.placeOfBirth || '-').toUpperCase(), col, y, ctx, 38);
  y = field(b, 'Date of issue', fmtDate(ctx.issued), col, y, ctx, 38);
  y = field(b, 'Date of expiry', fmtDate(ctx.expires), col, y, ctx, 38);
  field(b, 'Authority', 'GCR', col, y, ctx, 38);

  // Under the photo
  let left = photo.y - 4;
  left = field(b, 'Gender', d.genderIdentity, 5, left, ctx, 27);
  if (d.pronouns) left = field(b, 'Pronouns', d.pronouns, 5, left, ctx, 27);
  rule(b, 5, 30, 32, GREY);
  text(b, "BEARER'S SIGNATURE", 5, 27, 4.6, ctx.fonts.regular, GREY);

  // Machine readable zone
  b.page.drawRectangle({ x: mm(b.x + 3), y: mm(b.y + 6), width: mm(PAGE.w - 6), height: mm(15), color: rgb(0.97, 0.97, 0.98) });
  const size = 7.15;
  ctx.mrz.forEach((line, i) => text(b, line, 4.2, 15.2 - i * 5, size, ctx.fonts.mono, INK));
}

function secondaryPage(b: Box, ctx: Ctx) {
  const d = ctx.data;
  idHeader(b, ctx, 'ADDITIONAL PARTICULARS');
  guilloche(b, PAGE.h - 16, 14);
  let y = PAGE.h - 21;
  y = field(b, 'Holder', `${d.givenNames} ${d.surname}`.toUpperCase(), 7, y, ctx, PAGE.w - 14);
  y = field(b, 'Marital status', d.maritalStatus || 'Not stated', 7, y, ctx, PAGE.w - 14);
  y = field(b, "Spouse's name", d.spouseName || '-', 7, y, ctx, PAGE.w - 14);
  text(b, 'ADDRESS', 7, y, 4.6, ctx.fonts.regular, GREY);
  y = paragraph(b, d.address || '-', 7, y - 3, PAGE.w - 14, 7, ctx.fonts.bold, INK, 1.25) - 2.2;
  text(b, 'OBSERVATIONS', 7, y, 4.6, ctx.fonts.regular, GREY);
  paragraph(b, 'The bearer is a citizen of Closet Republic in good standing and has agreed to uphold its Constitution. Commemorative keepsake of a parody community: not an identity or travel document.', 7, y - 3, PAGE.w - 14, 6, ctx.fonts.italic, INK);
  pageNumber(b, TOTAL_PAGES - 3, ctx);
}

function stampPage(b: Box, ctx: Ctx, n: number) {
  guilloche(b, PAGE.h - 12, 10);
  const size = 34;
  b.page.drawImage(ctx.logoBlack, { x: mm(b.x + (PAGE.w - size) / 2), y: mm(b.y + (PAGE.h - size) / 2), width: mm(size), height: mm(size), opacity: 0.06 });
  text(b, 'VISAS · STAMPS', PAGE.w / 2, PAGE.h - 8, 5.5, ctx.fonts.bold, GREY, { align: 'center', spacing: 1 });
  pageNumber(b, n, ctx);
}

function drawPassportPage(b: Box, n: number, side: 'left' | 'right', ctx: Ctx) {
  if (n === 1 || n === 3) return cover(b, ctx, side, true); // page 3 is a copy of the front cover
  if (n === TOTAL_PAGES) return cover(b, ctx, side, false); // back cover, same colour as the front
  if (n === 2) return agreement(b, ctx);
  if (n === 4) return idPage(b, ctx);
  if (n === TOTAL_PAGES - 3) return secondaryPage(b, ctx);
  if (n === TOTAL_PAGES - 1) return; // blank
  return stampPage(b, ctx, n);
}

// ---------- imposition ----------

function cropMarks(page: PDFPage, x: number, y: number, w: number, h: number) {
  const off = BLEED + 1;
  const len = 5;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: mm(x1), y: mm(y1) }, end: { x: mm(x2), y: mm(y2) }, thickness: 0.3, color: rgb(0, 0, 0) });
  for (const cx of [x, x + w]) {
    for (const cy of [y, y + h]) {
      const dx = cx === x ? -1 : 1;
      const dy = cy === y ? -1 : 1;
      line(cx + dx * off, cy, cx + dx * (off + len), cy);
      line(cx, cy + dy * off, cx, cy + dy * (off + len));
    }
  }
  // Fold marks in the middle of the spread, dashed.
  const mid = x + w / 2;
  for (const [from, to] of [
    [y - off, y - off - len],
    [y + h + off, y + h + off + len],
  ]) {
    page.drawLine({ start: { x: mm(mid), y: mm(from) }, end: { x: mm(mid), y: mm(to) }, thickness: 0.3, color: rgb(0, 0, 0), dashArray: [2, 1.5] });
  }
}

function folioPages(i: number) {
  const P = TOTAL_PAGES;
  return { front: [P - 2 * i, 2 * i + 1], back: [2 * i + 2, P - 2 * i - 1] } as const;
}

function sheetSide(ctx: Ctx, folios: [number, number], face: 'front' | 'back', label: string) {
  const page = ctx.doc.addPage([mm(A4.w), mm(A4.h)]);
  text({ page, x: 0, y: 0 }, label, A4.w / 2, A4.h - 9, 7, ctx.fonts.regular, GREY, { align: 'center' });
  folios.forEach((folio, row) => {
    const [leftNo, rightNo] = folioPages(folio)[face];
    const y = SPREAD_Y[row];
    drawPassportPage({ page, x: SPREAD_X, y }, leftNo, 'left', ctx);
    drawPassportPage({ page, x: SPREAD_X + PAGE.w, y }, rightNo, 'right', ctx);
    cropMarks(page, SPREAD_X, y, PAGE.w * 2, PAGE.h);
  });
  text(
    { page, x: 0, y: 0 },
    'Print at actual size (100%), double-sided, flip on long edge. Cut on the corner marks, fold on the dashed marks.',
    A4.w / 2,
    8,
    6,
    ctx.fonts.regular,
    GREY,
    { align: 'center' },
  );
}

export function newPassportNumber() {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return `CR${String(n[0] % 10_000_000).padStart(7, '0')}`;
}

export async function buildPassportPdf(data: PassportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const name = `${data.givenNames} ${data.surname}`.trim();
  doc.setTitle(`Closet Republic passport: ${name}`);
  doc.setSubject('Printable passport booklet of Closet Republic');
  doc.setCreator('closetrepublic.com');
  doc.setProducer('Closet Republic passport office');

  const [regular, bold, italic, mono] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaOblique),
    doc.embedFont(StandardFonts.Courier),
  ]);
  const [photo, logoWhite, logoBlack] = await Promise.all([
    data.photo.type === 'png' ? doc.embedPng(data.photo.bytes) : doc.embedJpg(data.photo.bytes),
    doc.embedPng(data.logoWhite),
    doc.embedPng(data.logoBlack),
  ]);

  const issued = new Date();
  issued.setUTCHours(0, 0, 0, 0);
  const expires = new Date(issued);
  expires.setUTCFullYear(expires.getUTCFullYear() + 10);
  const passportNo = newPassportNumber();
  const mrz = buildMrz({
    country: 'CRP',
    nationality: 'CRP',
    surname: data.surname,
    givenNames: data.givenNames,
    passportNo,
    birth: data.dateOfBirth ? new Date(`${data.dateOfBirth}T00:00:00Z`) : null,
    sex: data.sexMarker,
    expiry: expires,
  });

  const ctx: Ctx = { doc, fonts: { regular, bold, italic, mono }, photo, logoWhite, logoBlack, data, passportNo, issued, expires, mrz };

  sheetSide(ctx, [0, 1], 'front', 'Sheet 1 of 3 · front · covers (photo paper works well)');
  sheetSide(ctx, [0, 1], 'back', 'Sheet 1 of 3 · back');
  sheetSide(ctx, [2, 3], 'front', 'Sheet 2 of 3 · front · stamp pages');
  sheetSide(ctx, [2, 3], 'back', 'Sheet 2 of 3 · back');
  sheetSide(ctx, [4, 5], 'front', 'Sheet 3 of 3 · front · stamp pages');
  sheetSide(ctx, [4, 5], 'back', 'Sheet 3 of 3 · back');

  return doc.save();
}
