/**
 * Per-aspect render palettes (DESIGN.md §4.1 palette anchors, §8 art
 * direction) + pattern painters (stripes / spots / plates).
 *
 * Pure string/data module: no DOM, no Math.random, no Date. `base`/`shade`/
 * `accent` mirror the exact hex values baked into `src/styles/main.css`'s
 * `--aspect-*` custom properties so procedural art and UI chrome always
 * agree; `pattern` is a render-only fourth tone (not in the CSS tokens,
 * since it's only ever used inside generated SVG markup) chosen to read
 * clearly against `base` for stripes/spots/plate decoration.
 */
import type { Aspect, Rng } from '../core/types';

export interface AspectPalette {
  base: string;
  shade: string;
  accent: string;
  pattern: string;
}

/** Thick dark outline color used on every drawn shape (DESIGN §8 — "not pure black"). */
export const OUTLINE_COLOR = '#2a1a33';
export const OUTLINE_WIDTH = 4;

export const ASPECT_PALETTES: Record<Aspect, AspectPalette> = {
  ember: { base: '#d9481f', shade: '#7a2410', accent: '#ff9142', pattern: '#ffdd9a' },
  frost: { base: '#a9d6e5', shade: '#4d7a8c', accent: '#eaf6fb', pattern: '#2f6b85' },
  verdant: { base: '#4a9c3e', shade: '#245c1d', accent: '#9be05f', pattern: '#d8f28a' },
  stone: { base: '#8a7460', shade: '#4a3c30', accent: '#cbb896', pattern: '#5e4a37' },
  storm: { base: '#e0c93f', shade: '#6b4fa0', accent: '#f5e97a', pattern: '#4a2f78' },
  tide: { base: '#2f7d9c', shade: '#164a5c', accent: '#6fd6d6', pattern: '#c7f5ee' },
  venom: { base: '#7a3f9c', shade: '#4a2361', accent: '#a8d95c', pattern: '#2c1338' },
  rune: { base: '#b23f8f', shade: '#5c1f4a', accent: '#f0c34a', pattern: '#ff9fd6' },
};

export function aspectPalette(aspect: Aspect): AspectPalette {
  return ASPECT_PALETTES[aspect];
}

// ---------------------------------------------------------------------------
// Color math (hex <-> HSL) — used for the seeded subtle hue-rotate on accent.
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = h / 360;
  return [
    hueToRgb(p, q, hn + 1 / 3) * 255,
    hueToRgb(p, q, hn) * 255,
    hueToRgb(p, q, hn - 1 / 3) * 255,
  ];
}

/** Rotate a hex color's hue by `degrees` (can be negative), preserving saturation/lightness. */
export function rotateHue(hex: string, degrees: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newHue = ((h + degrees) % 360 + 360) % 360;
  const [nr, ng, nb] = hslToRgb(newHue, s, l);
  return rgbToHex(nr, ng, nb);
}

// ---------------------------------------------------------------------------
// Pattern painters
// ---------------------------------------------------------------------------

export type PatternKind = 'stripes' | 'spots' | 'plates' | 'none';

export interface PatternBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Diagonal cel-shading-friendly stripes across `bounds`, jittered by `rng`. */
export function paintStripes(rng: Rng, color: string, bounds: PatternBounds, opacity = 0.75): string {
  const count = rng.int(3, 5);
  const parts: string[] = [];
  const span = bounds.width + bounds.height;
  for (let i = 0; i < count; i++) {
    const t = i / count + rng.next() * 0.08;
    const cx = bounds.x + t * bounds.width;
    const w = bounds.width * (0.09 + rng.next() * 0.05);
    const x1 = cx - span * 0.15;
    const y1 = bounds.y - span * 0.1;
    const x2 = cx + span * 0.35;
    const y2 = bounds.y + bounds.height + span * 0.1;
    parts.push(
      `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${(x1 + w).toFixed(1)} ${y1.toFixed(1)} L ${(x2 + w).toFixed(1)} ${y2.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${color}" opacity="${opacity}" />`,
    );
  }
  return parts.join('');
}

/** Scattered rounded spots across `bounds`, jittered by `rng`. */
export function paintSpots(rng: Rng, color: string, bounds: PatternBounds, opacity = 0.85): string {
  const count = rng.int(4, 7);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const cx = bounds.x + rng.next() * bounds.width;
    const cy = bounds.y + rng.next() * bounds.height;
    const r = bounds.height * (0.05 + rng.next() * 0.05);
    parts.push(`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * 0.8).toFixed(1)}" fill="${color}" opacity="${opacity}" />`);
  }
  return parts.join('');
}

/** Small scute/plate texture scattered in a loose grid across `bounds`. */
export function paintPlateTexture(rng: Rng, color: string, bounds: PatternBounds, opacity = 0.8): string {
  const cols = 3;
  const rows = 2;
  const parts: string[] = [];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (rng.next() < 0.35) continue;
      const px = bounds.x + (bounds.width * (cx + 0.5)) / cols + (rng.next() - 0.5) * (bounds.width / cols) * 0.4;
      const py = bounds.y + (bounds.height * (cy + 0.5)) / rows + (rng.next() - 0.5) * (bounds.height / rows) * 0.4;
      const s = bounds.width * 0.09;
      parts.push(
        `<rect x="${(px - s / 2).toFixed(1)}" y="${(py - s / 2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="${(s * 0.3).toFixed(1)}" fill="${color}" opacity="${opacity}" />`,
      );
    }
  }
  return parts.join('');
}

/** Dispatch to the right painter (or '' for 'none'). */
export function paintPattern(kind: PatternKind, rng: Rng, color: string, bounds: PatternBounds): string {
  switch (kind) {
    case 'stripes':
      return paintStripes(rng, color, bounds);
    case 'spots':
      return paintSpots(rng, color, bounds);
    case 'plates':
      return paintPlateTexture(rng, color, bounds);
    case 'none':
      return '';
  }
}
