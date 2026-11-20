// Copies the pdf.js runtime data (CMaps, standard fonts, wasm decoders, ICC
// profiles) into the renderer's public folder so they are served locally.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const src = resolve(root, 'node_modules/pdfjs-dist');
const dest = resolve(root, 'src/ui/public/pdfjs');

if (!existsSync(src)) {
  console.error('pdfjs-dist is not installed; run npm install first.');
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  if (existsSync(resolve(src, dir))) cpSync(resolve(src, dir), resolve(dest, dir), { recursive: true });
}
console.log('pdf.js assets copied to src/ui/public/pdfjs');
