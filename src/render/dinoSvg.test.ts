import { describe, expect, it } from 'vitest';
import { SPECIES_LIST } from '../data/index';
import type { Stage } from '../core/types';
import { OUTLINE_COLOR } from './palettes';
import { dinoSvg } from './dinoSvg';

const STAGES: Stage[] = ['juvenile', 'adult', 'alpha'];

/** Naive balance check: every opening tag of `name` has a matching closing tag (or is self-closed). */
function tagBalance(svg: string, name: string): { open: number; close: number } {
  const open = (svg.match(new RegExp(`<${name}[\\s>]`, 'g')) ?? []).filter((m) => !m.endsWith('/>')).length;
  const selfClosed = (svg.match(new RegExp(`<${name}[^>]*/>`, 'g')) ?? []).length;
  const close = (svg.match(new RegExp(`</${name}>`, 'g')) ?? []).length;
  return { open: open - selfClosed, close };
}

describe('dinoSvg', () => {
  it('returns valid-ish SVG for all species x 3 stages', () => {
    for (const species of SPECIES_LIST) {
      for (const stage of STAGES) {
        const svg = dinoSvg({ species, stage, seed: 12345 });
        expect(svg.startsWith('<svg'), `${species.id}/${stage} starts with <svg`).toBe(true);
        expect(svg.endsWith('</svg>'), `${species.id}/${stage} ends with </svg>`).toBe(true);
        expect(svg, `${species.id}/${stage} viewBox`).toContain('viewBox="0 0 200 200"');
        expect(svg, `${species.id}/${stage} outline color`).toContain(OUTLINE_COLOR);

        for (const tag of ['svg', 'g', 'defs', 'clipPath']) {
          const { open, close } = tagBalance(svg, tag);
          expect(open, `${species.id}/${stage}: balanced <${tag}>`).toBe(close);
        }
        // No accidentally nested/unterminated quotes producing "<<" or '"">'.
        expect(svg).not.toContain('<<');
        expect(svg).not.toContain('NaN');
        expect(svg).not.toContain('undefined');
      }
    }
  });

  it('is deterministic for the same seed', () => {
    const species = SPECIES_LIST[0]!;
    const a = dinoSvg({ species, stage: 'adult', seed: 987 });
    const b = dinoSvg({ species, stage: 'adult', seed: 987 });
    expect(a).toBe(b);
  });

  it('varies with the seed', () => {
    const species = SPECIES_LIST[0]!;
    const a = dinoSvg({ species, stage: 'adult', seed: 1 });
    const b = dinoSvg({ species, stage: 'adult', seed: 2 });
    expect(a).not.toBe(b);
  });

  it('produces distinct output across all 8 archetypes (same seed/stage/aspect palette aside)', () => {
    const byArchetype = new Map<string, string>();
    for (const species of SPECIES_LIST) {
      if (byArchetype.has(species.archetype)) continue;
      byArchetype.set(species.archetype, dinoSvg({ species, stage: 'adult', seed: 555 }));
    }
    expect(byArchetype.size).toBe(8);
    const outputs = [...byArchetype.values()];
    expect(new Set(outputs).size).toBe(outputs.length);
  });

  it('facing left wraps content in a mirror transform; right does not', () => {
    const species = SPECIES_LIST[0]!;
    const left = dinoSvg({ species, stage: 'adult', seed: 42, facing: 'left' });
    const right = dinoSvg({ species, stage: 'adult', seed: 42, facing: 'right' });
    expect(left).toContain('scale(-1,1)');
    expect(right).not.toContain('scale(-1,1)');
  });

  it('alpha stage adds an aura glow layer that juveniles lack', () => {
    const species = SPECIES_LIST[0]!;
    const juvenile = dinoSvg({ species, stage: 'juvenile', seed: 42 });
    const alpha = dinoSvg({ species, stage: 'alpha', seed: 42 });
    expect(alpha).toContain('radialGradient id="aura-');
    expect(juvenile).not.toContain('radialGradient');
  });

  it('respects the size option', () => {
    const species = SPECIES_LIST[0]!;
    expect(dinoSvg({ species, stage: 'adult', seed: 1, size: 96 })).toContain('width="96"');
    expect(dinoSvg({ species, stage: 'adult', seed: 1, size: 220 })).toContain('height="220"');
  });
});
