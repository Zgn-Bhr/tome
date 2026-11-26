// Library search (spec §7.8): a fuzzy match on title, author and file name.
// Every word of the query must match somewhere; substrings and word starts
// score highest, letters-in-order matches (for 3+ letter words) score lower.

export interface SearchDoc {
  id: string;
  title: string;
  author?: string;
  file: string;
}

export interface SearchHit {
  id: string;
  score: number;
}

const FIELD_WEIGHT = { title: 3, author: 2, file: 1 } as const;

/** Lowercase and strip accents, so "Café" matches "cafe". */
export function normalize(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function tokenScore(token: string, text: string): number {
  if (!token || !text) return 0;
  const i = text.indexOf(token);
  if (i >= 0) {
    const wordStart = i === 0 || /[^a-z0-9]/.test(text[i - 1]!);
    return (wordStart ? 3 : 2) + (i === 0 ? 1 : 0);
  }
  if (token.length < 3) return 0;
  // Letters in order, penalised for each gap.
  let j = 0;
  let last = -1;
  let gaps = 0;
  for (let k = 0; k < text.length && j < token.length; k++) {
    if (text[k] === token[j]) {
      if (last >= 0 && k - last > 1) gaps++;
      last = k;
      j++;
    }
  }
  if (j < token.length) return 0;
  return Math.max(0.2, 1 - gaps * 0.15);
}

export function searchBooks(query: string, docs: readonly SearchDoc[]): SearchHit[] {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const hits: (SearchHit & { title: string })[] = [];
  for (const d of docs) {
    const fields: [string, number][] = [
      [normalize(d.title), FIELD_WEIGHT.title],
      [normalize(d.author ?? ''), FIELD_WEIGHT.author],
      [normalize(d.file), FIELD_WEIGHT.file],
    ];
    let score = 0;
    let all = true;
    for (const t of tokens) {
      let best = 0;
      for (const [text, w] of fields) best = Math.max(best, tokenScore(t, text) * w);
      if (best === 0) {
        all = false;
        break;
      }
      score += best;
    }
    if (all) hits.push({ id: d.id, score, title: d.title });
  }
  return hits
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    .map(({ id, score }) => ({ id, score }));
}
