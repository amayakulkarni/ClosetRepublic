// Copies the Open Peeps "Separate Atoms" SVGs into public/peeps and writes the
// avatar-builder manifest. Usage: node scripts/import-peeps.mjs "<path to Flat Assets/Separate Atoms>"
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) throw new Error('Pass the path to "Flat Assets/Separate Atoms"');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const categories = ['head', 'face', 'facial-hair', 'accessories', 'body'];
const manifest = {};

for (const cat of categories) {
  const out = path.join(root, 'public/peeps', cat);
  fs.mkdirSync(out, { recursive: true });
  manifest[cat] = [];
  for (const file of fs.readdirSync(path.join(src, cat)).filter((f) => f.endsWith('.svg')).sort()) {
    const label = file.replace(/\.svg$/, '').replace(/^\*\s*/, '').replace(/-/g, ' ');
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    fs.copyFileSync(path.join(src, cat, file), path.join(out, `${id}.svg`));
    manifest[cat].push({ id, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
}

fs.writeFileSync(path.join(root, 'src/lib/peeps-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(Object.entries(manifest).map(([k, v]) => `${k}: ${v.length}`).join(', '));
