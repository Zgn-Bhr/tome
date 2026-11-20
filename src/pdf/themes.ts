// Page themes (spec §8.7), baked in when a bitmap is drawn so scrolling only
// moves a finished canvas.

import type { PageTheme } from '../core/models';

/** Night maps inverted luminance linearly onto #171A22 → #D8D2C4. */
const NIGHT_LO = '#171A22';
const NIGHT_SPAN = '#C1B8A2'; // #D8D2C4 − #171A22, per channel

export function drawThemed(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap | HTMLCanvasElement,
  theme: PageTheme,
  dx = 0,
  dy = 0,
  dw = ctx.canvas.width,
  dh = ctx.canvas.height,
): void {
  ctx.save();
  ctx.imageSmoothingQuality = 'high';
  if (theme === 'night') ctx.filter = 'invert(1) hue-rotate(180deg)';
  else if (theme === 'dim') ctx.filter = 'brightness(0.6)';
  ctx.drawImage(bitmap, dx, dy, dw, dh);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'multiply';
  if (theme === 'paper') ctx.fillStyle = '#F4EEE1';
  else if (theme === 'sepia') ctx.fillStyle = '#E9D9BC';
  else if (theme === 'dim') ctx.fillStyle = '#FFEFD9'; // slight warm tint, no inversion
  else ctx.fillStyle = NIGHT_SPAN;
  ctx.fillRect(dx, dy, dw, dh);
  if (theme === 'night') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = NIGHT_LO;
    ctx.fillRect(dx, dy, dw, dh);
  }
  ctx.restore();
}

export const THEME_BG: Record<PageTheme, string> = {
  paper: '#F4EEE1',
  sepia: '#E9D9BC',
  night: '#171A22',
  dim: '#998F82', // white × 0.6 × #FFEFD9
};
