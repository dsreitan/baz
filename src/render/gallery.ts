/**
 * Art-review gallery: every species x 3 stages x 4 seeds in a grid.
 * Pure string-building (no DOM) — `main.ts` mounts the returned HTML into
 * `#app` behind the `#gallery` dev route (see main.ts header comment).
 */
import { SPECIES_LIST } from '../data/index';
import { dinoSvg } from './dinoSvg';
import type { Stage } from '../core/types';

const STAGES: Stage[] = ['juvenile', 'adult', 'alpha'];
const SEEDS = [1, 2, 3, 4];

/** Render the full species x stage x seed review grid as a standalone HTML fragment. */
export function gallerySvg(): string {
  const rows: string[] = [];
  for (const species of SPECIES_LIST) {
    const cells: string[] = [];
    for (const stage of STAGES) {
      for (const seed of SEEDS) {
        const svg = dinoSvg({ species, stage, seed: seed * 7919 + species.id.length, facing: 'right', size: 96 });
        cells.push(
          `<div class="gallery-cell"><div class="gallery-thumb">${svg}</div><div class="gallery-caption">${stage}<br/>seed ${seed}</div></div>`,
        );
      }
    }
    rows.push(
      `<section class="gallery-row"><h2>${species.name} <span class="gallery-meta">${species.archetype} · ${species.aspect} · ${species.role}</span></h2><div class="gallery-grid">${cells.join('')}</div></section>`,
    );
  }
  return `<div class="gallery"><h1>Clawbound — Art Review Gallery</h1><p class="gallery-hint">Every species x stage x seed, for eyeballing procedural art. Not part of the normal game flow.</p>${rows.join('')}</div>`;
}
