// Generates test PDFs (spec §14 fixtures) with Electron's printToPDF.
// Run: npx electron scripts/make-fixtures.mjs  → fixtures/pdfs/*.pdf
// All text is generated here, so the fixtures carry no third-party content.

import { app, BrowserWindow } from 'electron';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const out = resolve(import.meta.dirname, '../fixtures/pdfs');
mkdirSync(out, { recursive: true });

const WORDS =
  'lantern harbour tide keeper signal north quiet stone gull mist ledger evening rope window salt chart beacon shore current voyage almanac weather glass hour bell distant ember morning'.split(
    ' ',
  );
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const word = () => WORDS[Math.floor(rand() * WORDS.length)];
const sentence = () => {
  const n = 8 + Math.floor(rand() * 14);
  const s = Array.from({ length: n }, word).join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
};
const para = (n = 5 + Math.floor(rand() * 4)) => `<p>${Array.from({ length: n }, sentence).join(' ')}</p>`;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];
const CHAPTERS = ['The Harbour Light', 'A Ledger of Tides', 'Fog Signals', 'The Northern Shoal', 'Keeping Watch', 'Salt and Glass', 'Winter Storms', 'The Relief Boat', 'Charts and Soundings', 'An Evening Bell', 'The Long Current', 'Last Entries'];

const bookCss = `
  @page { size: 5.5in 8.5in; margin: 0.7in 0.65in; }
  body { font-family: Georgia, serif; font-size: 11.5pt; line-height: 1.55; color: #222; }
  h1 { font-size: 15pt; text-align: center; margin: 0 0 0.4in; letter-spacing: .04em; white-space: nowrap; }
  .num { break-before: page; text-align:center; font-size: 11pt; letter-spacing: .25em; color: #666; margin: 1.6in 0 8pt; text-indent: 0; }
  h1 + p, .intro + p { text-indent: 0; }
  .intro { break-before: page; margin-top: 1.6in; }
  p { text-align: justify; text-indent: 1.4em; margin: 0; }
  .title { text-align:center; margin-top: 2.6in; font-size: 26pt; letter-spacing: .1em; }
  .author { text-align:center; margin-top: 12pt; letter-spacing: .3em; font-size: 10pt; }
`;

function bookHtml() {
  let body = `<div class="title">THE LIGHTHOUSE ALMANAC</div><div class="author">A TOME TEST FIXTURE</div>`;
  body += `<h1 class="intro">Introduction</h1>${para()}${para()}${para()}`;
  CHAPTERS.forEach((t, i) => {
    body += `<p class="num">CHAPTER ${ROMAN[i]}</p><h1>Chapter ${ROMAN[i]}. ${t}</h1>`;
    for (let k = 0; k < 14 + Math.floor(rand() * 10); k++) body += para();
  });
  return `<!doctype html><html><head><meta charset="utf-8"><title>The Lighthouse Almanac</title><style>${bookCss}</style></head><body>${body}</body></html>`;
}

function paperHtml() {
  const css = `
    @page { size: letter; margin: 0.75in 0.7in; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.5pt; line-height: 1.38; color: #111; }
    .head { text-align:center; margin-bottom: 14pt; }
    .head .t { font-size: 17pt; font-weight: 700; }
    .head .a { margin-top: 6pt; font-size: 10pt; color: #444; }
    .abstract { margin: 10pt 0.4in 16pt; font-size: 9.5pt; }
    .abstract h2 { font-size: 10pt; text-align:center; margin: 0 0 4pt; }
    .cols { column-count: 2; column-gap: 0.3in; }
    h2 { font-size: 11pt; margin: 10pt 0 4pt; }
    p { margin: 0 0 6pt; text-align: justify; }
    .fig { height: 1.4in; background: #e6e9ee; margin: 6pt 0; break-inside: avoid; }
  `;
  const sections = ['Introduction', 'Methods', 'Results', 'Discussion', 'Conclusion'];
  let body = `<div class="head"><div class="t">Tidal rhythms in a model harbour: a test paper</div><div class="a">A. Fixture · B. Generator</div></div>`;
  body += `<div class="abstract"><h2>Abstract</h2>${para(6)}</div><div class="cols">`;
  sections.forEach((s, i) => {
    body += `<h2>${i + 1}. ${s}</h2>`;
    for (let k = 0; k < 9; k++) body += para();
    body += `<div class="fig"></div>`;
  });
  body += `<h2>References</h2>`;
  for (let k = 0; k < 14; k++) body += `<p>[${k + 1}] ${sentence()}</p>`;
  body += `</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Tidal rhythms in a model harbour</title><style>${css}</style></head><body>${body}</body></html>`;
}

function slidesHtml() {
  const css = `
    @page { size: 10in 5.625in; margin: 0; }
    body { margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; }
    .s { width: 10in; height: 5.625in; box-sizing: border-box; padding: 0.6in 0.8in; break-after: page; background: #12263f; color: #f2f2f2; }
    .s h1 { font-size: 30pt; margin: 0 0 0.3in; }
    .s li { font-size: 16pt; margin: 8pt 0; }
  `;
  let body = '';
  for (let i = 1; i <= 10; i++) body += `<section class="s"><h1>Slide ${i}: ${CHAPTERS[i % CHAPTERS.length]}</h1><ul><li>${sentence()}</li><li>${sentence()}</li><li>${sentence()}</li></ul></section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Harbour Briefing</title><style>${css}</style></head><body>${body}</body></html>`;
}

/** A "scanned" two-column paper: drawn blocks only, so the PDF has no text layer. */
function scanHtml() {
  const css = `
    @page { size: letter; margin: 0.7in; }
    body { margin: 0; }
    .p { break-after: page; height: 9.5in; position: relative; }
    .band { height: 0.9in; background: repeating-linear-gradient(#333 0 6px, transparent 6px 16px); margin-bottom: 0.3in; }
    .cols { display: flex; gap: 0.35in; height: 8in; }
    .col { flex: 1; background: repeating-linear-gradient(#444 0 5px, transparent 5px 13px); }
  `;
  let body = '';
  for (let i = 0; i < 4; i++) body += `<section class="p">${i === 0 ? '<div class="band"></div>' : ''}<div class="cols"><div class="col"></div><div class="col"></div></div></section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title></title><style>${css}</style></head><body>${body}</body></html>`;
}

function plainHtml() {
  let body = '';
  for (let k = 0; k < 160; k++) body += para();
  return `<!doctype html><html><head><meta charset="utf-8"><title></title><style>@page{size:A5;margin:.6in} body{font-family:Georgia,serif;font-size:11pt;line-height:1.5} p{text-align:justify;margin:0 0 8pt}</style></head><body>${body}</body></html>`;
}

// One window for every fixture: some sandboxes refuse to spawn extra renderers.
async function print(win, html, file, opts) {
  const tmp = join(out, `${file}.html`);
  writeFileSync(tmp, html);
  try {
    await win.loadFile(tmp);
    const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, ...opts });
    writeFileSync(join(out, file), pdf);
    console.log('wrote', file, `${Math.round(pdf.length / 1024)} KB`);
  } finally {
    rmSync(tmp, { force: true });
  }
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 1400 });
  try {
    // Chromium only writes an outline into tagged PDFs.
    await print(win, bookHtml(), 'lighthouse-almanac.pdf', { generateDocumentOutline: true, generateTaggedPDF: true });
    await print(win, paperHtml(), 'tidal-rhythms-paper.pdf', { generateDocumentOutline: false });
    await print(win, slidesHtml(), 'harbour-briefing-slides.pdf', { generateDocumentOutline: false });
    await print(win, plainHtml(), 'untitled_notes.pdf', { generateDocumentOutline: false });
    await print(win, scanHtml(), 'scanned-two-column.pdf', { generateDocumentOutline: false });
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
