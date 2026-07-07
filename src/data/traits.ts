/**
 * Trait table — each individual dino rolls exactly one from its species pool.
 * Conventions: `percent` fields are whole numbers (10 = +10%); onHitStatus
 * `chance` is a fraction 0..1; status `power` follows moves.ts conventions.
 */
import type { TraitDef } from '../core/types';

export const TRAIT_LIST: TraitDef[] = [
  {
    id: 'thick_hide',
    name: 'Thick Hide',
    description: '+10% DEF.',
    effect: { kind: 'statPercent', stat: 'def', percent: 10 },
  },
  {
    id: 'brawny',
    name: 'Brawny',
    description: '+10% ATK.',
    effect: { kind: 'statPercent', stat: 'atk', percent: 10 },
  },
  {
    id: 'fleet_footed',
    name: 'Fleet-Footed',
    description: '+10% SPD.',
    effect: { kind: 'statPercent', stat: 'spd', percent: 10 },
  },
  {
    id: 'stout_heart',
    name: 'Stout Heart',
    description: '+10% max HP.',
    effect: { kind: 'statPercent', stat: 'hp', percent: 10 },
  },
  {
    id: 'keen_eye',
    name: 'Keen Eye',
    description: '+10% critical hit chance.',
    effect: { kind: 'critChance', percent: 10 },
  },
  {
    id: 'opportunist',
    name: 'Opportunist',
    description: '+20% bonus effect when consuming a combo state.',
    effect: { kind: 'comboDamage', percent: 20 },
  },
  {
    id: 'ember_blooded',
    name: 'Ember-Blooded',
    description: '+15% damage with Ember moves.',
    effect: { kind: 'aspectDamage', aspect: 'ember', percent: 15 },
  },
  {
    id: 'frost_kissed',
    name: 'Frost-Kissed',
    description: '+15% damage with Frost moves.',
    effect: { kind: 'aspectDamage', aspect: 'frost', percent: 15 },
  },
  {
    id: 'storm_touched',
    name: 'Storm-Touched',
    description: '+15% damage with Storm moves.',
    effect: { kind: 'aspectDamage', aspect: 'storm', percent: 15 },
  },
  {
    id: 'tide_born',
    name: 'Tide-Born',
    description: '+15% damage with Tide moves.',
    effect: { kind: 'aspectDamage', aspect: 'tide', percent: 15 },
  },
  {
    id: 'verdant_heart',
    name: 'Verdant Heart',
    description: '+15% damage with Verdant moves.',
    effect: { kind: 'aspectDamage', aspect: 'verdant', percent: 15 },
  },
  {
    id: 'rune_etched',
    name: 'Rune-Etched',
    description: '+15% damage with Rune moves.',
    effect: { kind: 'aspectDamage', aspect: 'rune', percent: 15 },
  },
  {
    id: 'venom_glands',
    name: 'Venom Glands',
    description: '20% chance to poison on hit.',
    effect: { kind: 'onHitStatus', status: 'poison', chance: 0.2, turns: 2, power: 0.05 },
  },
  {
    id: 'searing_maw',
    name: 'Searing Maw',
    description: '20% chance to burn on hit.',
    effect: { kind: 'onHitStatus', status: 'burn', chance: 0.2, turns: 2, power: 0.05 },
  },
  {
    id: 'unshakable',
    name: 'Unshakable',
    description: '60% resistance to stun.',
    effect: { kind: 'statusResist', status: 'stun', percent: 60 },
  },
  {
    id: 'iron_gut',
    name: 'Iron Gut',
    description: '60% resistance to poison.',
    effect: { kind: 'statusResist', status: 'poison', percent: 60 },
  },
];
