import { describe, expect, it } from 'vitest';
import { autoFit, clampView, columnRegion, layout, nextFit, pageBox, scrollFraction, zoomAbout } from './viewport';

const VP = { w: 1280, h: 800 };
const A5_SIZE = { w: 420, h: 595 }; // portrait book page, points
const A5 = pageBox(A5_SIZE);
const SLIDE = { w: 960, h: 540 };

describe('reader viewport', () => {
  it('fits width to 1060 px with wide gutters (§7.4)', () => {
    const l = layout(A5, VP, 'width', 110, { zoom: 1, scrollY: 0, panX: 0 });
    expect(l.pw).toBeCloseTo(1060);
    expect(l.x).toBeCloseTo(110);
    expect(l.y).toBe(0);
    expect(l.maxScroll).toBeCloseTo(1060 * (595 / 420) - 800);
  });

  it('fits the whole page with a 20 px margin', () => {
    const l = layout(A5, VP, 'page', 110, { zoom: 1, scrollY: 0, panX: 0 });
    expect(l.ph).toBeCloseTo(760);
    expect(l.maxScroll).toBe(0);
    expect(l.y).toBeCloseTo(20);
  });

  it('clamps scroll, pan and zoom', () => {
    const v = clampView(A5, VP, 'width', 110, { zoom: 9, scrollY: -50, panX: 1e9 });
    expect(v.zoom).toBe(4);
    expect(v.scrollY).toBe(0);
    const l = layout(A5, VP, 'width', 110, v);
    expect(v.panX).toBeCloseTo(l.maxPan);
  });

  it('zooms about the anchor point', () => {
    const v0 = { zoom: 1, scrollY: 300, panX: 0 };
    const anchor = { x: 640, y: 400 };
    const before = layout(A5, VP, 'width', 110, v0);
    const pt = { x: (anchor.x - before.x) / before.ds, y: (anchor.y - before.y) / before.ds };
    const v1 = zoomAbout(A5, VP, 'width', 110, v0, 2, anchor);
    const after = layout(A5, VP, 'width', 110, v1);
    expect(after.x + pt.x * after.ds).toBeCloseTo(anchor.x);
    expect(after.y + pt.y * after.ds).toBeCloseTo(anchor.y);
  });

  it('reports scroll as a fraction', () => {
    const v = { zoom: 1, scrollY: 100, panX: 0 };
    const l = layout(A5, VP, 'width', 110, v);
    expect(scrollFraction(l, v)).toBeCloseTo(100 / l.maxScroll);
  });

  it('picks fit page for landscape pages and cycles fits', () => {
    expect(autoFit(SLIDE, 'auto', false)).toBe('page');
    expect(autoFit(A5_SIZE, 'auto', false)).toBe('width');
    expect(autoFit(A5_SIZE, 'auto', true)).toBe('column');
    expect(autoFit(A5_SIZE, 'page', true)).toBe('page');
    expect(nextFit('width', false)).toBe('page');
    expect(nextFit('page', false)).toBe('width');
    expect(nextFit('page', true)).toBe('column');
  });

  it('fills the content area with a cropped region and offsets the page', () => {
    const crop = { x0: 40, y0: 50, x1: 380, y1: 545 };
    const l = layout(crop, VP, 'width', 110, { zoom: 1, scrollY: 0, panX: 0 });
    expect(l.pw).toBeCloseTo(1060);
    expect(l.x).toBeCloseTo(110);
    expect(l.ox).toBeCloseTo(110 - 40 * l.ds);
    expect(l.oy).toBeCloseTo(0 - 50 * l.ds);
  });

  it('fits a column segment plus 24 px padding into the content area', () => {
    const seg = { x0: 40, y0: 100, x1: 200, y1: 500 };
    const r = columnRegion(seg, A5_SIZE, VP, 110);
    const l = layout(r, VP, 'column', 110, { zoom: 1, scrollY: 0, panX: 0 });
    expect(l.pw).toBeCloseTo(1060, 0);
    // The segment itself spans 1060 − 48 px.
    expect((seg.x1 - seg.x0) * l.ds).toBeCloseTo(1012, 0);
  });
});
