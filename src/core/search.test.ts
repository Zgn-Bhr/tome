import { describe, expect, it } from 'vitest';
import { normalize, searchBooks, tokenScore, type SearchDoc } from './search';

const docs: SearchDoc[] = [
  { id: 'origin', title: 'On the Origin of Species', author: 'Charles Darwin', file: 'origin.pdf' },
  { id: 'meditations', title: 'Meditations', author: 'Marcus Aurelius', file: 'meditations.pdf' },
  { id: 'sleep', title: 'A review of sleep regulation in animals', file: 'review-sleep-regulation.pdf' },
  { id: 'cafe', title: 'Café Society', file: 'cafe.pdf' },
];

describe('search', () => {
  it('matches title, author and file name', () => {
    expect(searchBooks('species', docs).map((h) => h.id)).toEqual(['origin']);
    expect(searchBooks('darwin', docs).map((h) => h.id)).toEqual(['origin']);
    expect(searchBooks('regulation.pdf', docs).map((h) => h.id)).toEqual(['sleep']);
  });

  it('needs every word to match', () => {
    expect(searchBooks('sleep animals', docs).map((h) => h.id)).toEqual(['sleep']);
    expect(searchBooks('sleep darwin', docs)).toEqual([]);
  });

  it('allows letters-in-order matches for longer words', () => {
    expect(searchBooks('orgn spcs', docs).map((h) => h.id)).toEqual(['origin']);
    expect(searchBooks('mdt', docs).map((h) => h.id)).toEqual(['meditations']);
  });

  it('ranks word starts above inner matches', () => {
    expect(tokenScore('med', 'meditations')).toBeGreaterThan(tokenScore('tat', 'meditations'));
  });

  it('ignores accents and case, and returns nothing for an empty query', () => {
    expect(normalize('Café')).toBe('cafe');
    expect(searchBooks('CAFE', docs).map((h) => h.id)).toEqual(['cafe']);
    expect(searchBooks('   ', docs)).toEqual([]);
  });

  it('does not fuzzy-match very short words', () => {
    expect(searchBooks('xq', docs)).toEqual([]);
  });
});
