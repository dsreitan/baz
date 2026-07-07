/**
 * Affix pools — 40 affixes across all six gear slots.
 *
 * min/max are the roll range at the ilvl-1 reference point; the Phase 4 loot
 * generator scales rolled values with item level. Percent-style ranges are
 * whole numbers (5 = 5%); onHitStatus chances are fractions 0..1.
 *
 * Slot conventions: plating = defensive, talon = offensive, charm =
 * utility/aspect/on-hit; whistle = command power, satchel = tame/loot,
 * standard = team auras.
 */
import type { AffixDef } from '../core/types';

export const AFFIX_LIST: AffixDef[] = [
  // -------------------------------------------------------------- PLATING
  {
    id: 'of_iron_scales',
    nameFragment: 'of Iron Scales',
    slots: ['plating'],
    effect: { kind: 'statFlat', stat: 'def', min: 2, max: 4 },
  },
  {
    id: 'of_the_bastion',
    nameFragment: 'of the Bastion',
    slots: ['plating'],
    effect: { kind: 'statPercent', stat: 'def', min: 4, max: 8 },
  },
  {
    id: 'of_deep_marrow',
    nameFragment: 'of Deep Marrow',
    slots: ['plating'],
    effect: { kind: 'statFlat', stat: 'hp', min: 8, max: 15 },
  },
  {
    id: 'of_the_colossus',
    nameFragment: 'of the Colossus',
    slots: ['plating'],
    effect: { kind: 'statPercent', stat: 'hp', min: 4, max: 8 },
  },
  {
    id: 'of_the_unbroken',
    nameFragment: 'of the Unbroken',
    slots: ['plating'],
    effect: { kind: 'statPercent', stat: 'hp', min: 6, max: 10 },
  },
  {
    id: 'of_grinding_plates',
    nameFragment: 'of Grinding Plates',
    slots: ['plating'],
    effect: { kind: 'statPercent', stat: 'def', min: 6, max: 10 },
  },

  // ---------------------------------------------------------------- TALON
  {
    id: 'of_savagery',
    nameFragment: 'of Savagery',
    slots: ['talon'],
    effect: { kind: 'statFlat', stat: 'atk', min: 2, max: 4 },
  },
  {
    id: 'of_the_predator',
    nameFragment: 'of the Predator',
    slots: ['talon'],
    effect: { kind: 'statPercent', stat: 'atk', min: 4, max: 8 },
  },
  {
    id: 'of_swift_pursuit',
    nameFragment: 'of Swift Pursuit',
    slots: ['talon'],
    effect: { kind: 'statFlat', stat: 'spd', min: 1, max: 3 },
  },
  {
    id: 'of_keen_edges',
    nameFragment: 'of Keen Edges',
    slots: ['talon'],
    effect: { kind: 'critChance', min: 3, max: 6 },
  },
  {
    id: 'of_exploitation',
    nameFragment: 'of Exploitation',
    slots: ['talon'],
    effect: { kind: 'comboDamage', min: 8, max: 15 },
  },
  {
    id: 'of_the_caldera',
    nameFragment: 'of the Caldera',
    slots: ['talon'],
    effect: { kind: 'aspectDamage', aspect: 'ember', min: 8, max: 15 },
  },
  {
    id: 'of_the_glacier',
    nameFragment: 'of the Glacier',
    slots: ['talon'],
    effect: { kind: 'aspectDamage', aspect: 'frost', min: 8, max: 15 },
  },
  {
    id: 'of_the_wildwood',
    nameFragment: 'of the Wildwood',
    slots: ['talon'],
    effect: { kind: 'aspectDamage', aspect: 'verdant', min: 8, max: 15 },
  },
  {
    id: 'of_the_mountain',
    nameFragment: 'of the Mountain',
    slots: ['talon'],
    effect: { kind: 'aspectDamage', aspect: 'stone', min: 8, max: 15 },
  },
  {
    id: 'of_the_tempest',
    nameFragment: 'of the Tempest',
    slots: ['talon'],
    effect: { kind: 'aspectDamage', aspect: 'storm', min: 8, max: 15 },
  },
  {
    id: 'of_the_deep',
    nameFragment: 'of the Deep',
    slots: ['talon'],
    effect: { kind: 'aspectDamage', aspect: 'tide', min: 8, max: 15 },
  },
  {
    id: 'of_the_mire',
    nameFragment: 'of the Mire',
    slots: ['talon'],
    effect: { kind: 'aspectDamage', aspect: 'venom', min: 8, max: 15 },
  },
  {
    id: 'of_the_first_glyph',
    nameFragment: 'of the First Glyph',
    slots: ['talon'],
    effect: { kind: 'aspectDamage', aspect: 'rune', min: 8, max: 15 },
  },

  // ---------------------------------------------------------------- CHARM
  {
    id: 'of_drowning',
    nameFragment: 'of Drowning',
    slots: ['charm'],
    effect: { kind: 'onHitStatus', status: 'soak', chanceMin: 0.1, chanceMax: 0.2, turns: 2, power: 0 },
  },
  {
    id: 'of_creeping_cold',
    nameFragment: 'of Creeping Cold',
    slots: ['charm'],
    effect: { kind: 'onHitStatus', status: 'chill', chanceMin: 0.1, chanceMax: 0.2, turns: 2, power: 0 },
  },
  {
    id: 'of_toppling',
    nameFragment: 'of Toppling',
    slots: ['charm'],
    effect: { kind: 'onHitStatus', status: 'knockdown', chanceMin: 0.08, chanceMax: 0.15, turns: 2, power: 0 },
  },
  {
    id: 'of_static',
    nameFragment: 'of Static',
    slots: ['charm'],
    effect: { kind: 'onHitStatus', status: 'charged', chanceMin: 0.1, chanceMax: 0.2, turns: 2, power: 0 },
  },
  {
    id: 'of_smoldering',
    nameFragment: 'of Smoldering',
    slots: ['charm'],
    effect: { kind: 'onHitStatus', status: 'burn', chanceMin: 0.1, chanceMax: 0.2, turns: 2, power: 0.04 },
  },
  {
    id: 'of_slow_venom',
    nameFragment: 'of Slow Venom',
    slots: ['charm'],
    effect: { kind: 'onHitStatus', status: 'poison', chanceMin: 0.1, chanceMax: 0.2, turns: 2, power: 0.04 },
  },
  {
    id: 'of_open_wounds',
    nameFragment: 'of Open Wounds',
    slots: ['charm'],
    effect: { kind: 'onHitStatus', status: 'bleed', chanceMin: 0.1, chanceMax: 0.2, turns: 2, power: 0.04 },
  },
  {
    id: 'of_quickening',
    nameFragment: 'of Quickening',
    slots: ['charm'],
    effect: { kind: 'statPercent', stat: 'spd', min: 4, max: 8 },
  },
  {
    id: 'of_the_ambusher',
    nameFragment: 'of the Ambusher',
    slots: ['charm'],
    effect: { kind: 'critChance', min: 2, max: 5 },
  },
  {
    id: 'of_chained_ruin',
    nameFragment: 'of Chained Ruin',
    slots: ['charm'],
    effect: { kind: 'comboDamage', min: 10, max: 18 },
  },

  // -------------------------------------------------------------- WHISTLE
  {
    id: 'of_the_clear_note',
    nameFragment: 'of the Clear Note',
    slots: ['whistle'],
    effect: { kind: 'commandPower', min: 8, max: 15 },
  },
  {
    id: 'of_the_war_horn',
    nameFragment: 'of the War Horn',
    slots: ['whistle'],
    effect: { kind: 'commandPower', min: 12, max: 20 },
  },
  {
    id: 'of_the_alpha_voice',
    nameFragment: 'of the Alpha Voice',
    slots: ['whistle'],
    effect: { kind: 'commandPower', min: 15, max: 25 },
  },

  // -------------------------------------------------------------- SATCHEL
  {
    id: 'of_gentle_hands',
    nameFragment: 'of Gentle Hands',
    slots: ['satchel'],
    effect: { kind: 'tameChance', min: 5, max: 10 },
  },
  {
    id: 'of_the_beast_whisperer',
    nameFragment: 'of the Beast Whisperer',
    slots: ['satchel'],
    effect: { kind: 'tameChance', min: 8, max: 15 },
  },
  {
    id: 'of_the_magpie',
    nameFragment: 'of the Magpie',
    slots: ['satchel'],
    effect: { kind: 'lootFind', min: 5, max: 10 },
  },
  {
    id: 'of_hidden_hoards',
    nameFragment: 'of Hidden Hoards',
    slots: ['satchel'],
    effect: { kind: 'lootFind', min: 8, max: 15 },
  },

  // ------------------------------------------------------------- STANDARD
  {
    id: 'of_the_hunting_pack',
    nameFragment: 'of the Hunting Pack',
    slots: ['standard'],
    effect: { kind: 'teamStatPercent', stat: 'atk', min: 3, max: 6 },
  },
  {
    id: 'of_the_shield_wall',
    nameFragment: 'of the Shield Wall',
    slots: ['standard'],
    effect: { kind: 'teamStatPercent', stat: 'def', min: 3, max: 6 },
  },
  {
    id: 'of_the_stampede',
    nameFragment: 'of the Stampede',
    slots: ['standard'],
    effect: { kind: 'teamStatPercent', stat: 'spd', min: 3, max: 6 },
  },
  {
    id: 'of_enduring_blood',
    nameFragment: 'of Enduring Blood',
    slots: ['standard'],
    effect: { kind: 'teamStatPercent', stat: 'hp', min: 3, max: 6 },
  },
];
