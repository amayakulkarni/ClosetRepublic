// Machine readable zone for a TD3 (booklet) passport: two lines of 44 characters.
// https://www.icao.int/publications/Documents/9303_p4_cons_en.pdf

const LINE = 44;

const mrzText = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '<')
    .replace(/^<+|<+$/g, '');

const pad = (s: string, n: number) => (s + '<'.repeat(n)).slice(0, n);

export function checkDigit(s: string) {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const v = c === '<' ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55;
    sum += v * weights[i % 3];
  }
  return String(sum % 10);
}

const yymmdd = (d: Date) =>
  `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

export type MrzInput = {
  country: string;
  surname: string;
  givenNames: string;
  passportNo: string;
  nationality: string;
  birth: Date | null; // null when left out: the field is filled with < as ICAO allows
  sex: 'F' | 'M' | 'X';
  expiry: Date;
};

export function buildMrz(p: MrzInput): [string, string] {
  const name = `${mrzText(p.surname)}<<${mrzText(p.givenNames)}`;
  const line1 = pad(`P<${pad(p.country, 3)}${name}`, LINE);

  const doc = pad(mrzText(p.passportNo), 9);
  const dob = p.birth ? yymmdd(p.birth) : '<<<<<<';
  const exp = yymmdd(p.expiry);
  const personal = pad('', 14);
  const sex = p.sex === 'X' ? '<' : p.sex;
  const docPart = doc + checkDigit(doc);
  const dobPart = dob + checkDigit(dob);
  const expPart = exp + checkDigit(exp);
  const personalPart = personal + checkDigit(personal);
  const composite = checkDigit(docPart + dobPart + expPart + personalPart);
  const line2 = docPart + pad(p.nationality, 3) + dobPart + sex + expPart + personalPart + composite;
  return [line1, line2];
}
