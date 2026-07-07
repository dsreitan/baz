/**
 * Alpha modifiers — the Diablo-style elite affixes rolled onto wild Alphas
 * (1-3 per Alpha, by tier). One per effect kind in types.ts.
 */
import type { AlphaModDef } from '../core/types';

export const ALPHA_MOD_LIST: AlphaModDef[] = [
  {
    id: 'stoneskin',
    name: 'Stoneskin',
    description: '+40% DEF. Hits land like they are striking bedrock.',
    effect: { kind: 'statPercent', stat: 'def', percent: 40 },
  },
  {
    id: 'venomous',
    name: 'Venomous',
    description: 'Its attacks have a 35% chance to poison.',
    effect: { kind: 'onHitStatus', status: 'poison', chance: 0.35, turns: 2, power: 0.05 },
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    description: 'Immune to all statuses and combo states.',
    effect: { kind: 'statusImmune' },
  },
  {
    id: 'thorned',
    name: 'Thorned',
    description: 'Reflects 20% of damage taken back at the attacker.',
    effect: { kind: 'thorns', percent: 20 },
  },
  {
    id: 'pack_leader',
    name: 'Pack Leader',
    description: 'Enters battle with an extra wild ally at its side.',
    effect: { kind: 'summonAdd' },
  },
  {
    id: 'frenzied',
    name: 'Frenzied',
    description: 'Below 50% HP it gains +30% ATK and SPD.',
    effect: { kind: 'frenzy' },
  },
];
