import { describe, expect, it } from 'vitest';
import { ASPECT_WHEEL } from '../core/types';
import { createRng } from '../core/rng';
import {
  ASPECT_PALETTES,
  OUTLINE_COLOR,
  OUTLINE_WIDTH,
  aspectPalette,
  paintPattern,
  paintSpots,
  paintStripes,
  rotateHue,
} from './palettes';

const HEX = /^#[0-9a-f]{6}$/i;

describe('ASPECT_PALETTES', () => {
  it('defines a full palette for all 8 aspects', () => {
    for (const aspect of ASPECT_WHEEL) {
      const palette = aspectPalette(aspect);
      expect(palette, aspect).toBeDefined();
      expect(palette.base, `${aspect}.base`).toMatch(HEX);
      expect(palette.shade, `${aspect}.shade`).toMatch(HEX);
      expect(palette.accent, `${aspect}.accent`).toMatch(HEX);
      expect(palette.pattern, `${aspect}.pattern`).toMatch(HEX);
    }
  });

  it('has exactly the 8 wheel aspects as keys', () => {
    expect(Object.keys(ASPECT_PALETTES).sort()).toEqual([...ASPECT_WHEEL].sort());
  });

  it('base/shade/accent triads match the CSS custom-property anchors (spot check)', () => {
    // Values baked into src/styles/main.css :root — palettes.ts must not drift.
    expect(ASPECT_PALETTES.ember.base).toBe('#d9481f');
    expect(ASPECT_PALETTES.ember.shade).toBe('#7a2410');
    expect(ASPECT_PALETTES.ember.accent).toBe('#ff9142');
    expect(ASPECT_PALETTES.rune.accent).toBe('#f0c34a');
    expect(ASPECT_PALETTES.tide.shade).toBe('#164a5c');
  });

  it('outline constants match DESIGN §8', () => {
    expect(OUTLINE_COLOR).toBe('#2a1a33');
    expect(OUTLINE_WIDTH).toBe(4);
  });
});

describe('rotateHue', () => {
  it('returns a valid hex color', () => {
    expect(rotateHue('#d9481f', 15)).toMatch(HEX);
    expect(rotateHue('#d9481f', -15)).toMatch(HEX);
  });

  it('rotating by 0 (or 360) is identity', () => {
    expect(rotateHue('#d9481f', 0)).toBe('#d9481f');
    expect(rotateHue('#6fd6d6', 360)).toBe('#6fd6d6');
  });

  it('is deterministic', () => {
    expect(rotateHue('#a9d6e5', 23)).toBe(rotateHue('#a9d6e5', 23));
  });
});

describe('pattern painters', () => {
  const bounds = { x: 40, y: 90, width: 90, height: 50 };

  it('stripes/spots/plates produce non-empty SVG fragments; none produces empty', () => {
    for (const kind of ['stripes', 'spots', 'plates'] as const) {
      const svg = paintPattern(kind, createRng(42), '#ffffff', bounds);
      expect(svg.length, kind).toBeGreaterThan(0);
      expect(svg, kind).toContain('fill="#ffffff"');
    }
    expect(paintPattern('none', createRng(42), '#ffffff', bounds)).toBe('');
  });

  it('is deterministic for the same seed and varies across seeds', () => {
    expect(paintStripes(createRng(7), '#fff', bounds)).toBe(paintStripes(createRng(7), '#fff', bounds));
    expect(paintSpots(createRng(1), '#fff', bounds)).not.toBe(paintSpots(createRng(2), '#fff', bounds));
  });
});
