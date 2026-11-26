import { describe, expect, it } from 'vitest';
import type { Box } from './box';
import { bookCrop, contentBox, cropForPage } from './crop';
import { analyseInk, columnSegments, detectColumnsFromText, otsu } from './columns';
import { detectHeadings, type TextLine } from './headings';

const PAGE_W = 600;
const PAGE_H = 800;

/** Lines of text as boxes: x-range, from y0 down in 14 pt steps. */
function lines(x0: number, x1: number, y0: number, n: number): Box[] {
  return Array.from({ length: n }, (_, i) => ({ x0, x1, y0: y0 + i * 14, y1: y0 + i * 14 + 10 }));
}

describe('auto-crop', () => {
  it('unions text boxes and pads by 2 % of the page width', () => {
    const box = contentBox([...lines(100, 500, 100, 10), { x0: 120, y0: 700, x1: 480, y1: 710 }], PAGE_W, PAGE_H)!;
    expect(box).toEqual({ x0: 88, y0: 88, x1: 512, y1: 722 });
  });

  it('uses the odd/even median unless the page sticks out of it', () => {
    const crop = bookCrop([
      { page: 1, box: { x0: 80, y0: 80, x1: 500, y1: 720 } },
      { page: 3, box: { x0: 90, y0: 80, x1: 510, y1: 720 } },
      { page: 5, box: { x0: 85, y0: 82, x1: 505, y1: 721 } },
      { page: 2, box: { x0: 100, y0: 80, x1: 520, y1: 720 } },
    ]);
    expect(crop.odd).toEqual({ x0: 85, y0: 80, x1: 505, y1: 720 });
    const inside = cropForPage({ x0: 90, y0: 90, x1: 500, y1: 700 }, crop, 7, PAGE_W, PAGE_H);
    expect(inside).toEqual(crop.odd);
    const wide = cropForPage({ x0: 40, y0: 90, x1: 500, y1: 700 }, crop, 7, PAGE_W, PAGE_H);
    expect(wide.x0).toBe(40);
    expect(cropForPage(null, crop, 2, PAGE_W, PAGE_H)).toEqual(crop.even);
  });

  it('falls back to the whole page when the crop is implausibly small', () => {
    expect(cropForPage({ x0: 0, y0: 0, x1: 50, y1: 50 }, null, 1, PAGE_W, PAGE_H)).toEqual({ x0: 0, y0: 0, x1: 600, y1: 800 });
  });
});

describe('column detection (text)', () => {
  const content: Box = { x0: 50, y0: 50, x1: 550, y1: 750 };
  const title = lines(50, 550, 50, 2); // full-width title
  const abstract = lines(70, 530, 90, 6); // full-width abstract
  const left = lines(50, 290, 200, 38);
  const right = lines(310, 550, 200, 38);

  it('finds the gutter and the full-width bands', () => {
    const l = detectColumnsFromText([...title, ...abstract, ...left, ...right], content)!;
    expect(l).not.toBeNull();
    expect(l.gutter.x0).toBeGreaterThanOrEqual(285);
    expect(l.gutter.x1).toBeLessThanOrEqual(315);
    expect(l.bands).toHaveLength(1); // title + abstract merge into one band
    expect(l.bands[0]!.y0).toBe(50);
    expect(l.bands[0]!.y1).toBeCloseTo(90 + 5 * 14 + 10);
  });

  it('orders segments band → left → right', () => {
    const l = detectColumnsFromText([...title, ...abstract, ...left, ...right], content)!;
    const segs = columnSegments(l, content);
    expect(segs.map((s) => s.kind)).toEqual(['band', 'left', 'right']);
    expect(segs[1]!.box.x1).toBe(l.gutter.x0);
    expect(segs[2]!.box.x0).toBe(l.gutter.x1);
  });

  it('makes no empty column strip above the first band (crop padding)', () => {
    const padded: Box = { x0: 40, y0: 30, x1: 560, y1: 760 }; // 20 pt of padding above the title
    const l = detectColumnsFromText([...title, ...abstract, ...left, ...right], padded)!;
    const segs = columnSegments(l, padded);
    expect(segs[0]!.kind).toBe('band');
    expect(segs[1]!.box.y0).toBeGreaterThanOrEqual(200);
  });

  it('rejects single-column pages', () => {
    expect(detectColumnsFromText(lines(50, 550, 50, 50), content)).toBeNull();
  });

  it('rejects pages with too little text', () => {
    expect(detectColumnsFromText([...lines(50, 290, 50, 5), ...lines(310, 550, 50, 5)], content)).toBeNull();
  });
});

describe('column detection (scans)', () => {
  it('picks Otsu thresholds between two populations', () => {
    const hist = new Array(256).fill(0);
    hist[20] = 100;
    hist[230] = 900;
    const t = otsu(hist);
    expect(t).toBeGreaterThanOrEqual(20);
    expect(t).toBeLessThan(230);
  });

  it('finds the gutter and a header band from ink', () => {
    const w = 300;
    const h = 400;
    const gray = new Uint8Array(w * h).fill(255);
    const fill = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) gray[y * w + x] = 0;
    };
    fill(30, 30, 270, 60); // header band across the page
    for (let y = 80; y < 370; y += 8) {
      fill(30, y, 140, y + 4); // left column lines
      fill(160, y, 270, y + 4); // right column lines
    }
    const r = analyseInk(gray, w, h);
    expect(r.content).not.toBeNull();
    expect(r.columns).not.toBeNull();
    expect(r.columns!.gutter.x0 * w).toBeGreaterThanOrEqual(139);
    expect(r.columns!.gutter.x1 * w).toBeLessThanOrEqual(161);
    expect(r.columns!.bands).toHaveLength(1);
  });

  it('sees one column on a single-column scan', () => {
    const w = 300;
    const h = 400;
    const gray = new Uint8Array(w * h).fill(255);
    for (let y = 30; y < 370; y += 8) for (let yy = y; yy < y + 4; yy++) for (let x = 30; x < 270; x++) gray[yy * w + x] = 0;
    expect(analyseInk(gray, w, h).columns).toBeNull();
  });
});

describe('headings', () => {
  const body = (page: number, n: number): TextLine[] => Array.from({ length: n }, (_, i) => ({ page, text: 'Body text line with plenty of words in it', size: 10, y: 0.1 + i * 0.02 }));

  it('finds section names and big lines, one per page', () => {
    const ls: TextLine[] = [
      { page: 1, text: 'A Big Paper Title', size: 18, y: 0.1 },
      { page: 1, text: 'Abstract', size: 11, y: 0.2 },
      ...body(1, 20),
      { page: 2, text: '1. Introduction', size: 11, y: 0.1 },
      ...body(2, 30),
      { page: 4, text: '2 Methods', size: 11, y: 0.3 },
      ...body(4, 30),
      { page: 6, text: 'References', size: 11, y: 0.5 },
    ];
    const h = detectHeadings(ls)!;
    expect(h.map((e) => [e.title, e.page])).toEqual([
      ['Abstract', 1],
      ['1. Introduction', 2],
      ['2 Methods', 4],
      ['References', 6],
    ]);
  });

  it('ignores running headers and needs at least three headings', () => {
    const header = (page: number): TextLine => ({ page, text: 'JOURNAL OF THINGS', size: 14, y: 0.5 });
    const ls = [1, 2, 3, 4, 5].flatMap((p) => [header(p), ...body(p, 20)]);
    expect(detectHeadings(ls)).toBeNull();
  });
});
