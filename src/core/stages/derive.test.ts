import { describe, expect, it } from 'vitest';
import { deriveStages, evenSplit, splitNumeral, stageForPage, stageTitle, type OutlineEntry } from './derive';

const e = (title: string, page: number | null, children: OutlineEntry[] = []): OutlineEntry => ({ title, page, children });

describe('splitNumeral', () => {
  it('moves chapter prefixes into the numeral', () => {
    expect(splitNumeral('Chapter IV. Natural Selection.')).toEqual({ label: 'Natural Selection', numeral: 'IV' });
    expect(splitNumeral('CHAPTER 3: The Struggle')).toEqual({ label: 'The Struggle', numeral: '3' });
    expect(splitNumeral('II. Variation under Nature')).toEqual({ label: 'Variation under Nature', numeral: 'II' });
    expect(splitNumeral('1 Introduction')).toEqual({ label: 'Introduction', numeral: '1' });
  });

  it('leaves plain titles alone', () => {
    expect(splitNumeral('Introduction')).toEqual({ label: 'Introduction' });
    expect(splitNumeral('I Am Legend')).toEqual({ label: 'I Am Legend' });
    expect(splitNumeral('2001 A Space Odyssey')).toEqual({ label: '2001 A Space Odyssey' });
  });
});

describe('deriveStages', () => {
  it('uses top-level outline entries and runs each to the next', () => {
    const { stages, source } = deriveStages('b', 100, [e('Intro', 1), e('Chapter I. One', 10), e('Chapter II. Two', 50)]);
    expect(source).toBe('outline');
    expect(stages.map((s) => [s.label, s.numeral, s.startPage, s.endPage, s.isFinal])).toEqual([
      ['Intro', 'Intro', 1, 9, false],
      ['One', 'I', 10, 49, false],
      ['Two', 'II', 50, 100, true],
    ]);
  });

  it('falls back to the second level when the top level is too short', () => {
    const outline = [e('Book', 1, [e('A', 1), e('B', 5), e('C', 9), e('D', 14)])];
    const { stages } = deriveStages('b', 20, outline);
    expect(stages.map((s) => s.label)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('merges a one-page cover entry into the next stage', () => {
    const { stages } = deriveStages('b', 40, [e('Cover', 1), e('Preface', 2), e('Ch 1', 10), e('Ch 2', 25)]);
    expect(stages[0]).toMatchObject({ label: 'Preface', startPage: 1, endPage: 9 });
  });

  it('adds front matter when the first entry starts late', () => {
    const { stages } = deriveStages('b', 100, [e('One', 12), e('Two', 40), e('Three', 70)]);
    expect(stages[0]).toMatchObject({ label: 'Front matter', startPage: 1, endPage: 11 });
  });

  it('skips entries that do not resolve and dedupes same-page entries', () => {
    const { stages } = deriveStages('b', 30, [e('A', 1), e('Broken', null), e('B', 10), e('B again', 10), e('C', 20)]);
    expect(stages.map((s) => s.label)).toEqual(['A', 'B', 'C']);
  });

  it('merges one-page stages into their neighbours', () => {
    const { stages } = deriveStages('b', 30, [e('A', 1), e('Part II', 10), e('B', 11), e('C', 20)]);
    expect(stages.map((s) => [s.label, s.startPage])).toEqual([
      ['A', 1],
      ['B', 10],
      ['C', 20],
    ]);
  });

  it('splits evenly when there is no outline', () => {
    const { stages, source } = deriveStages('b', 528, null);
    expect(source).toBe('even');
    expect(stages).toHaveLength(10);
    expect(stages[0]).toMatchObject({ label: 'Part 1', startPage: 1 });
    expect(stages[9]).toMatchObject({ endPage: 528, isFinal: true });
  });

  it('clamps the even split to 3..10 stages and never exceeds the page count', () => {
    expect(evenSplit(18)).toHaveLength(3);
    expect(evenSplit(2)).toHaveLength(2);
    expect(evenSplit(5000)).toHaveLength(10);
  });

  it('gives unnumbered stages a short numeral among numbered ones', () => {
    const { stages } = deriveStages('b', 100, [e('Introduction', 1), e('Chapter I. One', 10), e('Chapter II. Two', 50), e('Epilogue', 90)]);
    expect(stages.map((s) => s.numeral)).toEqual(['Intro', 'I', 'II', 'Epil']);
    expect(stageTitle(stages[0]!)).toBe('Introduction');
    expect(stageTitle(stages[1]!)).toBe('I — One');
  });

  it('leaves numerals alone when few stages have them', () => {
    const { stages } = deriveStages('b', 100, [e('Intro', 1), e('Setup', 10), e('Chapter 3: Run', 50)]);
    expect(stages.map((s) => s.numeral)).toEqual([undefined, undefined, '3']);
  });

  it('finds the stage for a page', () => {
    const { stages } = deriveStages('b', 100, [e('A', 1), e('B', 10), e('C', 50)]);
    expect(stageForPage(stages, 49)?.label).toBe('B');
    expect(stageForPage(stages, 50)?.label).toBe('C');
  });
});
