/**
 * Inline-SVG glyph library (DESIGN §8 style contract: thick dark outline,
 * flat saturated fills). Pure string-building — every function returns a
 * small self-contained `<svg>` string sized on a 0 0 32 32 viewBox unless
 * noted. Callers (dinoCard/itemCard/healthBar/commandBar/battleScreen) drop
 * these into DOM via `innerHTML`.
 *
 * Icons accept an optional `fill` (defaults to `currentColor`, so CSS can
 * drive color via the wrapping element's `color`) and an optional `size`.
 */
import type { Aspect, GearSlot, Rarity, Role, StatusId } from '../core/types';
import { OUTLINE_COLOR } from './palettes';

function svgWrap(inner: string, size: number, viewBox = '0 0 32 32'): string {
  return `<svg viewBox="${viewBox}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

function stroke(d: string, fill: string, width = 2.5): string {
  return `<path d="${d}" fill="${fill}" stroke="${OUTLINE_COLOR}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

// ---------------------------------------------------------------------------
// Aspect glyphs
// ---------------------------------------------------------------------------

const ASPECT_PATHS: Record<Aspect, string> = {
  ember: 'M16 3c2 5-4 6-4 10a4 4 0 0 0 8 0c0-1-1-2-1-2 2 1 3 4 3 6a6 6 0 0 1-12 0c0-6 5-8 6-14z',
  frost: 'M16 2v28M6 9l20 14M26 9L6 23M16 2l-3 4h6l-3-4M16 30l-3-4h6l3 4M6 9l1-5 4 2M26 9l-1-5-4 2M6 23l1 5 4-2M26 23l-1 5-4-2',
  verdant: 'M16 4c8 0 12 6 12 13 0 8-6 12-12 12-2-8-2-17 0-25zM16 16v13',
  stone: 'M4 26 12 8l6 10 4-6 6 14z',
  storm: 'M18 2 7 18h7l-3 12 13-17h-7l4-11z',
  tide: 'M2 14c3-4 6-4 9 0s6 4 9 0 6-4 9 0M2 22c3-4 6-4 9 0s6 4 9 0 6-4 9 0',
  venom: 'M16 3c5 6 9 12 9 17a9 9 0 0 1-18 0c0-5 4-11 9-17z M12 20a1.6 1.6 0 1 0 .1 0zM19 21a1.6 1.6 0 1 0 .1 0z',
  rune: 'M16 2 28 16 16 30 4 16zM16 10v12M10 16h12',
};

/** One of the 8 Primal Aspect glyphs (DESIGN §4.1). */
export function aspectIcon(aspect: Aspect, fill = 'currentColor', size = 32): string {
  return svgWrap(stroke(ASPECT_PATHS[aspect], fill), size);
}

// ---------------------------------------------------------------------------
// Role glyphs
// ---------------------------------------------------------------------------

function roleInner(role: Role, fill: string): string {
  switch (role) {
    case 'bruiser': // fist
      return stroke('M9 14a4 4 0 0 1 8 0v-2a3 3 0 0 1 6 0v2a3 3 0 0 1 5 1v6a8 8 0 0 1-8 8h-3a8 8 0 0 1-7-4l-3-5a2.2 2.2 0 0 1 3.4-2.7L12 20V14z', fill);
    case 'guardian': // shield
      return stroke('M16 3 27 8v8c0 8-6 12-11 13-5-1-11-5-11-13V8z', fill);
    case 'stalker': // dagger
      return stroke('M16 2 20 6 18 22 16 30 14 22 12 6z M11 6h10', fill);
    case 'warden': // heart-leaf
      return stroke('M16 27C7 20 4 15 4 10a6 6 0 0 1 12-1 6 6 0 0 1 12 1c0 5-3 10-12 17z', fill);
    case 'screecher': // screech waves from an open mouth
      return stroke('M6 20a8 8 0 0 1 0-8l6 2a3 3 0 0 0 0 4z', fill) + `<path d="M18 10a10 10 0 0 1 0 12M23 6a16 16 0 0 1 0 20" fill="none" stroke="${fill}" stroke-width="2.4" stroke-linecap="round"/>`;
  }
}

/** One of the 5 pack roles (DESIGN §4.2). */
export function roleIcon(role: Role, fill = 'currentColor', size = 32): string {
  return svgWrap(roleInner(role, fill), size);
}

// ---------------------------------------------------------------------------
// Gear slot glyphs
// ---------------------------------------------------------------------------

function slotInner(slot: GearSlot, fill: string): string {
  switch (slot) {
    case 'plating': // armor plate
      return stroke('M16 3 27 8v7c0 8-6 12-11 13-5-1-11-5-11-13V8z M16 10v14M11 14h10', fill);
    case 'talon': // claw/blade
      return stroke('M20 3c4 3 6 8 4 14L14 29l-3-3 12-12c1-4 0-7-3-11z', fill);
    case 'charm': // pendant
      return stroke('M16 3 21 9l-5 20-5-20z M16 3a4 4 0 1 0 .1 0z', fill);
    case 'whistle': // packmaster whistle
      return stroke('M6 16a8 8 0 1 0 16 0 8 8 0 0 0-16 0zM22 14l6-4v6z', fill);
    case 'satchel': // expedition satchel
      return stroke('M9 12 11 6h10l2 6h3v14H6V12z M13 12v4M19 12v4', fill);
    case 'standard': // pack-wide banner
      return stroke('M9 3v26M9 4h15l-4 5 4 5H9z', fill);
  }
}

/** One of the 6 gear slots (3 dino + 3 packmaster). */
export function slotIcon(slot: GearSlot, fill = 'currentColor', size = 32): string {
  return svgWrap(slotInner(slot, fill), size);
}

// ---------------------------------------------------------------------------
// Rarity gem & essence
// ---------------------------------------------------------------------------

const RARITY_VAR: Record<Rarity, string> = {
  common: 'var(--rarity-common)',
  uncommon: 'var(--rarity-uncommon)',
  rare: 'var(--rarity-rare)',
  epic: 'var(--rarity-epic)',
  legendary: 'var(--rarity-legendary)',
};

/** Faceted gem colored from the `--rarity-*` CSS token (kept in sync with main.css). */
export function rarityGem(rarity: Rarity, size = 20): string {
  const fill = RARITY_VAR[rarity];
  return svgWrap(
    stroke('M16 3 26 12 16 30 6 12z M6 12h20M16 3v9', fill, 2.2),
    size,
  );
}

/** Small glowing droplet used for the Essence currency. */
export function essenceIcon(fill = 'var(--color-accent)', size = 20): string {
  return svgWrap(stroke('M16 3c6 8 10 13 10 18a10 10 0 0 1-20 0c0-5 4-10 10-18z', fill), size);
}

// ---------------------------------------------------------------------------
// Status chips
// ---------------------------------------------------------------------------

interface StatusVisual {
  path: string;
  fill: string;
  label: string;
}

const STATUS_VISUALS: Record<StatusId, StatusVisual> = {
  burn: { path: ASPECT_PATHS.ember, fill: 'var(--aspect-ember-base)', label: 'Burn' },
  poison: { path: ASPECT_PATHS.venom, fill: 'var(--aspect-venom-base)', label: 'Poison' },
  bleed: { path: 'M16 4c5 7 8 12 8 16a8 8 0 0 1-16 0c0-4 3-9 8-16z', fill: '#a12c2c', label: 'Bleed' },
  soak: { path: ASPECT_PATHS.tide, fill: 'var(--aspect-tide-base)', label: 'Soak' },
  chill: { path: ASPECT_PATHS.frost, fill: 'var(--aspect-frost-base)', label: 'Chill' },
  knockdown: { path: 'M4 24 16 8l12 16z', fill: 'var(--aspect-stone-base)', label: 'Knockdown' },
  charged: { path: ASPECT_PATHS.storm, fill: 'var(--aspect-storm-base)', label: 'Charged' },
  stun: { path: 'M18 2 7 18h7l-3 12 13-17h-7z', fill: '#e0c93f', label: 'Stun' },
  taunt: { path: 'M6 10h20v10H14l-4 4v-4H6z', fill: '#c0432f', label: 'Taunt' },
  harden: { path: 'M16 3 27 8v8c0 8-6 12-11 13-5-1-11-5-11-13V8z', fill: 'var(--aspect-stone-accent)', label: 'Harden' },
  regen: { path: 'M16 27C7 20 4 15 4 10a6 6 0 0 1 12-1 6 6 0 0 1 12 1c0 5-3 10-12 17z', fill: 'var(--aspect-verdant-base)', label: 'Regen' },
  enrage: { path: 'M4 26 12 8l6 10 4-6 6 14z', fill: '#c0432f', label: 'Enrage' },
  slow: { path: 'M16 4a12 12 0 1 0 .1 0zM16 10v7l5 3', fill: 'var(--color-text-muted)', label: 'Slow' },
};

/** Status effect glyph — healthBar wraps this with a numeric turns-left badge. */
export function statusIcon(status: StatusId, size = 18): string {
  const visual = STATUS_VISUALS[status];
  return svgWrap(stroke(visual.path, visual.fill, 2), size);
}

export function statusLabel(status: StatusId): string {
  return STATUS_VISUALS[status].label;
}
