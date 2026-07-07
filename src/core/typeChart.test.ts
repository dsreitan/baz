import { describe, expect, it } from 'vitest';
import { ASPECT_WHEEL, type Aspect } from './types';
import { aspectMultiplier } from './typeChart';

/**
 * Hand-derived expectation table, built independently from the modular-
 * arithmetic implementation in typeChart.ts. Wheel order (DESIGN.md §4.1):
 *   Ember -> Frost -> Verdant -> Stone -> Storm -> Tide -> Venom -> Rune -> (Ember)
 * Each aspect is strong (1.5x) vs the next two clockwise, weak (0.67x) vs
 * the previous two, neutral (1x) otherwise.
 */
const STRONG_AGAINST: Record<Aspect, [Aspect, Aspect]> = {
  ember: ['frost', 'verdant'],
  frost: ['verdant', 'stone'],
  verdant: ['stone', 'storm'],
  stone: ['storm', 'tide'],
  storm: ['tide', 'venom'],
  tide: ['venom', 'rune'],
  venom: ['rune', 'ember'],
  rune: ['ember', 'frost'],
};

const WEAK_AGAINST: Record<Aspect, [Aspect, Aspect]> = {
  ember: ['rune', 'venom'],
  frost: ['ember', 'rune'],
  verdant: ['frost', 'ember'],
  stone: ['verdant', 'frost'],
  storm: ['stone', 'verdant'],
  tide: ['storm', 'stone'],
  venom: ['tide', 'storm'],
  rune: ['venom', 'tide'],
};

function expectedMultiplier(attacker: Aspect, defender: Aspect): number {
  if (STRONG_AGAINST[attacker].includes(defender)) return 1.5;
  if (WEAK_AGAINST[attacker].includes(defender)) return 0.67;
  return 1;
}

describe('aspectMultiplier', () => {
  it('sanity: ASPECT_WHEEL has the 8 expected aspects in order', () => {
    expect(ASPECT_WHEEL).toEqual([
      'ember',
      'frost',
      'verdant',
      'stone',
      'storm',
      'tide',
      'venom',
      'rune',
    ]);
  });

  it('matches the hand-derived table for all 64 attacker/defender combinations', () => {
    for (const attacker of ASPECT_WHEEL) {
      for (const defender of ASPECT_WHEEL) {
        const actual = aspectMultiplier(attacker, defender);
        const expected = expectedMultiplier(attacker, defender);
        expect(actual, `${attacker} -> ${defender}`).toBeCloseTo(expected, 5);
      }
    }
  });

  it('same aspect is always neutral', () => {
    for (const aspect of ASPECT_WHEEL) {
      expect(aspectMultiplier(aspect, aspect)).toBe(1);
    }
  });

  it('spot check: ember is strong vs frost and verdant', () => {
    expect(aspectMultiplier('ember', 'frost')).toBeCloseTo(1.5, 5);
    expect(aspectMultiplier('ember', 'verdant')).toBeCloseTo(1.5, 5);
  });

  it('spot check: ember is weak vs venom and rune', () => {
    expect(aspectMultiplier('ember', 'venom')).toBeCloseTo(0.67, 5);
    expect(aspectMultiplier('ember', 'rune')).toBeCloseTo(0.67, 5);
  });

  it('spot check: ember vs stone/storm/tide is neutral (3-4 steps away)', () => {
    expect(aspectMultiplier('ember', 'stone')).toBe(1);
    expect(aspectMultiplier('ember', 'storm')).toBe(1);
    expect(aspectMultiplier('ember', 'tide')).toBe(1);
  });

  it('wheel wraps correctly at the Rune/Ember boundary', () => {
    // Rune is strong vs Ember and Frost (wrap-around clockwise).
    expect(aspectMultiplier('rune', 'ember')).toBeCloseTo(1.5, 5);
    expect(aspectMultiplier('rune', 'frost')).toBeCloseTo(1.5, 5);
    // Venom is weak vs Storm and Tide, but strong vs Ember (wraps forward).
    expect(aspectMultiplier('venom', 'ember')).toBeCloseTo(1.5, 5);
  });
});
