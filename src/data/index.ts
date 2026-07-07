/**
 * Content data barrel — re-exports every table as both an array and an
 * id-keyed lookup map. This is the only "logic" allowed in src/data:
 * building the index maps.
 */
import type {
  AffixDef,
  AffixId,
  AlphaModDef,
  AlphaModId,
  BiomeDef,
  BiomeId,
  CommandDef,
  CommandId,
  EventDef,
  EventId,
  MoveDef,
  MoveId,
  SkillDef,
  SkillId,
  SpeciesDef,
  SpeciesId,
  TraitDef,
  TraitId,
} from '../core/types';
import { AFFIX_LIST } from './affixes';
import { ALPHA_MOD_LIST } from './alphaMods';
import { BIOME_LIST } from './biomes';
import { COMMAND_LIST, DEFAULT_COMMANDS } from './commands';
import { EVENT_LIST } from './events';
import { BASE_NAMES, LEGENDARY_POWERS, RARITY_WEIGHTS } from './items';
import { MOVE_LIST } from './moves';
import { SKILL_LIST } from './skills';
import { SPECIES_LIST } from './species';
import { GAME_TAGLINE, GAME_TITLE, UI } from './strings';
import { TRAIT_LIST } from './traits';

function byId<T extends { id: string }>(list: readonly T[]): Record<string, T> {
  return Object.fromEntries(list.map((entry) => [entry.id, entry]));
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = byId(SPECIES_LIST);
export const MOVES: Record<MoveId, MoveDef> = byId(MOVE_LIST);
export const TRAITS: Record<TraitId, TraitDef> = byId(TRAIT_LIST);
export const AFFIXES: Record<AffixId, AffixDef> = byId(AFFIX_LIST);
export const SKILLS: Record<SkillId, SkillDef> = byId(SKILL_LIST);
export const COMMANDS: Record<CommandId, CommandDef> = byId(COMMAND_LIST);
export const BIOMES: Record<BiomeId, BiomeDef> = byId(BIOME_LIST);
export const EVENTS: Record<EventId, EventDef> = byId(EVENT_LIST);
export const ALPHA_MODS: Record<AlphaModId, AlphaModDef> = byId(ALPHA_MOD_LIST);

/**
 * New-game starter choices: one bruiser, one guardian, one warden — all
 * level-1-friendly with low tame difficulty.
 */
export const STARTER_SPECIES: SpeciesId[] = ['emberfang', 'thornback', 'bloomcrest'];

export {
  AFFIX_LIST,
  ALPHA_MOD_LIST,
  BASE_NAMES,
  BIOME_LIST,
  COMMAND_LIST,
  DEFAULT_COMMANDS,
  EVENT_LIST,
  GAME_TAGLINE,
  GAME_TITLE,
  LEGENDARY_POWERS,
  MOVE_LIST,
  RARITY_WEIGHTS,
  SKILL_LIST,
  SPECIES_LIST,
  TRAIT_LIST,
  UI,
};
