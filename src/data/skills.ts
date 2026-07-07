/**
 * Packmaster skill tree — 3 branches × 3 tiers × 2 nodes = 18 skills.
 * Tier n+1 requires any tier-n node in the same branch (enforced by
 * progression.ts in Phase 3). Percent values are whole numbers.
 */
import type { SkillDef } from '../core/types';

export const SKILL_LIST: SkillDef[] = [
  // ------------------------------------------------------------- TACTICIAN
  {
    id: 'tactician_lure',
    branch: 'tactician',
    tier: 1,
    name: 'Baiting Throw',
    description: 'Unlock the Throw Lure command.',
    effect: { kind: 'unlockCommand', command: 'throw_lure' },
  },
  {
    id: 'tactician_battle_cry',
    branch: 'tactician',
    tier: 1,
    name: 'Battle Cry',
    description: 'Rally is 25% more powerful.',
    effect: { kind: 'commandBonus', command: 'rally', percent: 25 },
  },
  {
    id: 'tactician_recall',
    branch: 'tactician',
    tier: 2,
    name: 'Practiced Recall',
    description: 'Unlock the Recall command.',
    effect: { kind: 'unlockCommand', command: 'recall' },
  },
  {
    id: 'tactician_field_surgeon',
    branch: 'tactician',
    tier: 2,
    name: 'Field Surgeon',
    description: 'Field Dressing heals 30% more.',
    effect: { kind: 'commandBonus', command: 'field_dressing', percent: 30 },
  },
  {
    id: 'tactician_focus',
    branch: 'tactician',
    tier: 3,
    name: 'Piercing Focus',
    description: 'Unlock the Focus command.',
    effect: { kind: 'unlockCommand', command: 'focus' },
  },
  {
    id: 'tactician_cleanse',
    branch: 'tactician',
    tier: 3,
    name: 'Purging Call',
    description: 'Unlock the Cleanse command.',
    effect: { kind: 'unlockCommand', command: 'cleanse' },
  },

  // --------------------------------------------------------------- HANDLER
  {
    id: 'handler_soothing_presence',
    branch: 'handler',
    tier: 1,
    name: 'Soothing Presence',
    description: '+15% tame chance.',
    effect: { kind: 'tameChance', percent: 15 },
  },
  {
    id: 'handler_roomy_pens',
    branch: 'handler',
    tier: 1,
    name: 'Roomy Pens',
    description: 'Reserve holds 2 more dinos.',
    effect: { kind: 'reserveSize', plus: 2 },
  },
  {
    id: 'handler_mentor',
    branch: 'handler',
    tier: 2,
    name: 'Mentor',
    description: 'Benched dinos earn 25% of expedition XP.',
    effect: { kind: 'benchXpShare', percent: 25 },
  },
  {
    id: 'handler_gentle_approach',
    branch: 'handler',
    tier: 2,
    name: 'Gentle Approach',
    description: '+25% tame chance.',
    effect: { kind: 'tameChance', percent: 25 },
  },
  {
    id: 'handler_broodmaster',
    branch: 'handler',
    tier: 3,
    name: 'Broodmaster',
    description: 'Reserve holds 4 more dinos.',
    effect: { kind: 'reserveSize', plus: 4 },
  },
  {
    id: 'handler_pack_tutor',
    branch: 'handler',
    tier: 3,
    name: 'Pack Tutor',
    description: 'Benched dinos earn 50% of expedition XP.',
    effect: { kind: 'benchXpShare', percent: 50 },
  },

  // ----------------------------------------------------------- SURVIVALIST
  {
    id: 'survivalist_scout',
    branch: 'survivalist',
    tier: 1,
    name: 'Scout’s Instinct',
    description: 'Reveal 1 extra node on the expedition map.',
    effect: { kind: 'mapReveal', plus: 1 },
  },
  {
    id: 'survivalist_forager',
    branch: 'survivalist',
    tier: 1,
    name: 'Forager',
    description: '+10% loot find.',
    effect: { kind: 'lootFind', percent: 10 },
  },
  {
    id: 'survivalist_herbalist',
    branch: 'survivalist',
    tier: 2,
    name: 'Herbalist',
    description: 'Groves heal 25% more.',
    effect: { kind: 'groveHealBonus', percent: 25 },
  },
  {
    id: 'survivalist_salvager',
    branch: 'survivalist',
    tier: 2,
    name: 'Salvager',
    description: '+25% essence from releases and salvage.',
    effect: { kind: 'essenceYield', percent: 25 },
  },
  {
    id: 'survivalist_diehard',
    branch: 'survivalist',
    tier: 3,
    name: 'Diehard',
    description: 'Keep 25% more loot when an expedition ends in defeat.',
    effect: { kind: 'defeatLootKeep', percent: 25 },
  },
  {
    id: 'survivalist_treasure_sense',
    branch: 'survivalist',
    tier: 3,
    name: 'Treasure Sense',
    description: '+20% loot find.',
    effect: { kind: 'lootFind', percent: 20 },
  },
];
