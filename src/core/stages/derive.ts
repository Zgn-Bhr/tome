// Stage derivation (spec §9.5): outline → headings → even split.

import type { BookId, Stage, StageSource } from '../models';

export interface OutlineEntry {
  title: string;
  /** 1-based page the entry points at, or null if it doesn't resolve. */
  page: number | null;
  children: OutlineEntry[];
}

interface Draft {
  label: string;
  numeral?: string;
  startPage: number;
}

const MIN_STAGES = 3;
const MAX_SECOND_LEVEL = 40;
/** A gap this long before the first outline entry becomes its own stage. */
const FRONT_MATTER_MIN_PAGES = 3;

export function deriveStages(
  bookId: BookId,
  pageCount: number,
  outline: readonly OutlineEntry[] | null,
): { stages: Stage[]; source: StageSource } {
  if (pageCount < 1) return { stages: [], source: 'even' };
  const fromOutline = outline ? stagesFromOutline(outline, pageCount) : null;
  if (fromOutline) return { stages: finalise(bookId, fromOutline, pageCount), source: 'outline' };
  return { stages: finalise(bookId, evenSplit(pageCount), pageCount), source: 'even' };
}

/** Returns drafts, or null when the outline isn't usable. */
export function stagesFromOutline(outline: readonly OutlineEntry[], pageCount: number): Draft[] | null {
  const valid = (e: OutlineEntry) => e.page !== null && e.page >= 1 && e.page <= pageCount;
  let entries = outline.filter(valid);
  if (entries.length < MIN_STAGES) {
    const second = outline.flatMap((e) => e.children).filter(valid);
    if (second.length >= MIN_STAGES && second.length <= MAX_SECOND_LEVEL) entries = second;
  }
  if (entries.length < 2) return null;

  // Sort by page; drop entries that point at the same page as an earlier one.
  const sorted = [...entries].sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
  const drafts: Draft[] = [];
  for (const e of sorted) {
    if (drafts.length && drafts[drafts.length - 1]!.startPage === e.page) continue;
    drafts.push({ ...splitNumeral(e.title), startPage: e.page! });
  }

  // Leading entries before page 2 that cover ≤1 page (e.g. "Cover") merge forward.
  while (drafts.length > 1 && drafts[0]!.startPage <= 1 && drafts[1]!.startPage <= 2) {
    drafts[1]!.startPage = drafts[0]!.startPage;
    drafts.shift();
  }

  // Pages before the first entry: a short gap joins stage 1, a long one is front matter.
  const first = drafts[0]!;
  if (first.startPage > 1) {
    if (first.startPage - 1 >= FRONT_MATTER_MIN_PAGES) drafts.unshift({ label: 'Front matter', startPage: 1 });
    else first.startPage = 1;
  }

  const merged = mergeTinyStages(drafts, pageCount);
  return merged.length >= 2 ? merged : null;
}

/** Stages of one page merge into the next stage (or the previous, at the end). */
function mergeTinyStages(drafts: Draft[], pageCount: number): Draft[] {
  const out = [...drafts];
  let i = 0;
  while (i < out.length && out.length > 1) {
    const end = i + 1 < out.length ? out[i + 1]!.startPage - 1 : pageCount;
    const len = end - out[i]!.startPage + 1;
    if (len <= 1) {
      if (i + 1 < out.length) {
        out[i + 1]!.startPage = out[i]!.startPage;
        out.splice(i, 1);
      } else {
        out.splice(i, 1); // last stage: the previous one extends to the end
      }
      continue;
    }
    i++;
  }
  return out;
}

export function evenSplit(pageCount: number): Draft[] {
  const n = Math.min(pageCount, Math.min(10, Math.max(3, Math.round(pageCount / 25))));
  return Array.from({ length: n }, (_, i) => ({
    label: `Part ${i + 1}`,
    startPage: Math.floor((i * pageCount) / n) + 1,
  }));
}

const SHORT_NAMES: Record<string, string> = {
  introduction: 'Intro',
  preface: 'Pref',
  prologue: 'Prol',
  foreword: 'Fwd',
  'front matter': 'Front',
  epilogue: 'Epil',
  afterword: 'Aftw',
  conclusion: 'End',
  appendix: 'App',
  notes: 'Notes',
  glossary: 'Gloss',
  bibliography: 'Bib',
  references: 'Refs',
  index: 'Index',
  acknowledgements: 'Ack',
  acknowledgments: 'Ack',
  contents: 'TOC',
};

/** Short node label for an unnumbered stage among numbered ones ("Intro"). */
export function shortName(label: string): string {
  const key = label.toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (SHORT_NAMES[key]) return SHORT_NAMES[key];
  const compact = label.replace(/[^A-Za-z0-9]/g, '');
  return compact.length <= 5 ? compact : compact.slice(0, 4);
}

function finalise(bookId: BookId, drafts: Draft[], pageCount: number): Stage[] {
  // When most stages carry numerals, give the rest a short one ("Intro") so
  // the map doesn't mix "1" with "I, II, III".
  const numbered = drafts.filter((d) => d.numeral).length;
  if (numbered > 0 && numbered >= drafts.length / 2) {
    drafts = drafts.map((d) => (d.numeral ? d : { ...d, numeral: shortName(d.label) || undefined }));
  }
  return drafts.map((d, i) => ({
    bookId,
    index: i,
    label: d.label,
    ...(d.numeral ? { numeral: d.numeral } : {}),
    startPage: d.startPage,
    endPage: i + 1 < drafts.length ? drafts[i + 1]!.startPage - 1 : pageCount,
    isFinal: i === drafts.length - 1,
  }));
}

const KEYWORD_PREFIX = /^\s*(?:chapter|chap\.|part|book|lecture|section)\s+([ivxlcdm]+|\d+)\b[.:)\-–—]?\s*(.*)$/i;
const ROMAN_PREFIX = /^\s*([IVXLCDM]+)[.:)]\s+(.+)$/;
const DIGIT_PREFIX = /^\s*(\d{1,3})(?:\.(?!\d))?[:)]?\s+(.+)$/;

/** Move a leading "Chapter IV."-style prefix into `numeral`. */
export function splitNumeral(title: string): { label: string; numeral?: string } {
  const clean = title.replace(/\s+/g, ' ').trim();
  const kw = KEYWORD_PREFIX.exec(clean);
  if (kw) {
    const numeral = kw[1]!.toUpperCase();
    const rest = tidy(kw[2] ?? '');
    return { label: rest || clean, numeral };
  }
  const roman = ROMAN_PREFIX.exec(clean);
  if (roman) return { label: tidy(roman[2]!), numeral: roman[1]! };
  const digit = DIGIT_PREFIX.exec(clean);
  if (digit) return { label: tidy(digit[2]!), numeral: digit[1]! };
  return { label: tidy(clean) || 'Untitled' };
}

function tidy(s: string): string {
  return s.replace(/^[\s.:—–-]+/, '').replace(/[\s.]+$/, '').trim();
}

/** The stage that contains `page`, or the last one. */
export function stageForPage(stages: readonly Stage[], page: number): Stage | undefined {
  return stages.find((s) => page >= s.startPage && page <= s.endPage) ?? stages[stages.length - 1];
}

/** Fraction of a stage passed when reading `page` (by position, not counted pages). */
export function positionInStage(stage: Stage, page: number): number {
  const len = stage.endPage - stage.startPage + 1;
  return Math.min(1, Math.max(0, (page - stage.startPage + 1) / len));
}

/** Short label for a stage node: its numeral, else its 1-based number. */
export function stageNumeral(stage: Stage): string {
  return stage.numeral ?? String(stage.index + 1);
}

/** "IV — Natural Selection", or just the label when the numeral adds nothing ("Intro"). */
export function stageTitle(stage: Stage): string {
  const n = stage.numeral;
  if (!n || stage.label.toLowerCase().startsWith(n.toLowerCase()) || !/^([IVXLCDM]+|\d+)$/i.test(n)) return stage.label;
  return `${n} — ${stage.label}`;
}
