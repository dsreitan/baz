/**
 * Expedition/game-loop runner — pure reducer logic for Phase 6's screens
 * (ARCHITECTURE §3/§4, DESIGN §3/§6/§7).
 *
 * This module exists so the node-resolution, event-outcome, and
 * battle-finish rules that glue Camp/ExpeditionMap/EventScreen/RewardScreen
 * together are unit-testable without a DOM, exactly like the rest of
 * `src/core`. It follows the same purity rules as the rest of this
 * directory: no DOM, no `Math.random`, no `Date` — every function that
 * needs randomness takes an `Rng` (or an already-forked one), and every
 * function that needs "now" takes a value the UI computed.
 *
 * Screens are expected to:
 *  - call `createNewGame` from the New Game flow (UI supplies a
 *    `Date.now()`-derived seed — the one sanctioned use per the Phase 6
 *    brief);
 *  - use `reserveSize`/`unlockedCommands`/`computeLootFindPercent`/
 *    `applyEssenceYieldBonus` wherever skill/gear bonuses need folding into
 *    a UI computation that isn't itself a `BattleState` (the engine already
 *    does the equivalent internally for in-battle math);
 *  - resolve grove/event/cache/battle nodes via `applyGroveHeal`/
 *    `resolveEventChoice`+`applyEventOutcome`/`rewardLoot` (gen/loot.ts,
 *    unchanged)/`finishBattle` respectively, then autosave.
 */
import { AFFIXES, SKILLS, DEFAULT_COMMANDS } from '../data/index';
import {
  DEFEAT_LOOT_KEEP_BASE_PERCENT,
  ENEMY_XP_PER_LEVEL,
  GROVE_HEAL_BASE_PERCENT,
  INVENTORY_CAP,
  MASTER_XP_SHARE_OF_BATTLE_PERCENT,
  RESERVE_SIZE_BASE,
} from './balance';
import { generateItem, rewardLoot } from './gen/loot';
import { generateStarter } from './gen/dino';
import { grantBattleXp, grantMasterXp, type GrantXpResult, type MasterXpResult } from './progression';
import { createRng } from './rng';
import type {
  BiomeId,
  CommandId,
  DinoInstance,
  EventDef,
  GameState,
  ItemInstance,
  MasterGearSlot,
  NodeKind,
  PackmasterState,
  Rng,
  SkillId,
  SpeciesId,
  Uid,
  WorldTier,
} from './types';

type EventChoice = EventDef['choices'][number];
type EventOutcome = EventChoice['outcome'];

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ---------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------

export interface NewGameOptions {
  name: string;
  starterSpecies: SpeciesId;
  /** UI-supplied seed (Date.now()-derived, per the Phase 6 "UI may use Date.now for the initial seed" rule). */
  seed: number;
}

/** Build a fresh `GameState`: level-1 packmaster, one starter dino, empty everything else. */
export function createNewGame(opts: NewGameOptions): GameState {
  const rng = createRng(opts.seed);
  const starter = generateStarter(opts.starterSpecies, rng.fork('starter'));

  const packmaster: PackmasterState = {
    name: opts.name.trim().length > 0 ? opts.name.trim() : 'Packmaster',
    level: 1,
    xp: 0,
    skillPoints: 0,
    skills: [],
    gear: {},
  };

  return {
    packmaster,
    dinos: [starter],
    activePack: [starter.uid],
    inventory: [],
    essence: 0,
    unlockedTier: 1,
    apexCleared: {},
    stats: { expeditionsCompleted: 0, apexKills: 0, dinosTamed: 0, battlesWon: 0 },
    seed: opts.seed,
  };
}

// ---------------------------------------------------------------------------
// Skill-derived numbers (mirrors what BattleRuntime computes internally,
// exposed for UI screens that need the same numbers outside of a battle).
// ---------------------------------------------------------------------------

/** Reserve capacity: base 6 (DESIGN §6) + any Handler `reserveSize` skill bonuses. */
export function reserveSize(skills: SkillId[]): number {
  let bonus = 0;
  for (const id of skills) {
    const skill = SKILLS[id];
    if (skill?.effect.kind === 'reserveSize') bonus += skill.effect.plus;
  }
  return RESERVE_SIZE_BASE + bonus;
}

/** Commands available this run: `DEFAULT_COMMANDS` plus any `unlockCommand` skill. */
export function unlockedCommands(skills: SkillId[]): CommandId[] {
  const unlocked = new Set<CommandId>(DEFAULT_COMMANDS);
  for (const id of skills) {
    const skill = SKILLS[id];
    if (skill?.effect.kind === 'unlockCommand') unlocked.add(skill.effect.command);
  }
  return [...unlocked];
}

/** Sum of Survivalist/gear `lootFind` percent bonuses (skills + satchel/master-gear affixes). */
export function computeLootFindPercent(skills: SkillId[], masterGear: Partial<Record<MasterGearSlot, ItemInstance>>): number {
  let percent = 0;
  for (const id of skills) {
    const skill = SKILLS[id];
    if (skill?.effect.kind === 'lootFind') percent += skill.effect.percent;
  }
  for (const slot of Object.keys(masterGear) as MasterGearSlot[]) {
    const item = masterGear[slot];
    if (!item) continue;
    for (const rolled of item.affixes) {
      const affix = AFFIXES[rolled.affix];
      if (affix?.effect.kind === 'lootFind') percent += rolled.value;
    }
  }
  return percent;
}

/** Applies the Survivalist `essenceYield` skill bonus to a salvage/release essence amount (DESIGN §5/§6). */
export function applyEssenceYieldBonus(amount: number, skills: SkillId[]): number {
  let percent = 0;
  for (const id of skills) {
    const skill = SKILLS[id];
    if (skill?.effect.kind === 'essenceYield') percent += skill.effect.percent;
  }
  return Math.round(amount * (1 + percent / 100));
}

function defeatLootKeepPercent(skills: SkillId[]): number {
  let bonus = 0;
  for (const id of skills) {
    const skill = SKILLS[id];
    if (skill?.effect.kind === 'defeatLootKeep') bonus += skill.effect.percent;
  }
  return DEFEAT_LOOT_KEEP_BASE_PERCENT + bonus;
}

// ---------------------------------------------------------------------------
// Camp / grove healing
// ---------------------------------------------------------------------------

/** Camp's free "Heal & Rest": restores every owned dino to full HP. Mutates in place. */
export function healAllDinos(dinos: DinoInstance[]): void {
  for (const dino of dinos) dino.currentHpPercent = 1;
}

/** Grove node heal: base percent (DESIGN §7) + any Survivalist `groveHealBonus` skill. Mutates `dinos` in place; returns the percent applied. */
export function applyGroveHeal(dinos: DinoInstance[], skills: SkillId[]): number {
  let bonus = 0;
  for (const id of skills) {
    const skill = SKILLS[id];
    if (skill?.effect.kind === 'groveHealBonus') bonus += skill.effect.percent;
  }
  const percent = GROVE_HEAL_BASE_PERCENT + bonus;
  for (const dino of dinos) {
    dino.currentHpPercent = clamp01(dino.currentHpPercent + percent / 100);
  }
  return percent;
}

/** Whether the active pack has at least one dino able to fight — false means the map screen must offer "adjust pack" before any battle node. */
export function canFieldActivePack(dinos: DinoInstance[]): boolean {
  return dinos.some((d) => d.currentHpPercent > 0);
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export interface InventoryUpdateResult {
  inventory: ItemInstance[];
  /** Items that didn't fit under `INVENTORY_CAP` — the reward screen should prompt to salvage or discard these. */
  overflow: ItemInstance[];
}

/** Appends `newItems` to `inventory`, capped at `INVENTORY_CAP`; anything past the cap comes back as `overflow`. */
export function applyLootToInventory(inventory: ItemInstance[], newItems: ItemInstance[]): InventoryUpdateResult {
  const room = Math.max(0, INVENTORY_CAP - inventory.length);
  const accepted = newItems.slice(0, room);
  const overflow = newItems.slice(room);
  return { inventory: [...inventory, ...accepted], overflow };
}

// ---------------------------------------------------------------------------
// XP helpers
// ---------------------------------------------------------------------------

/** Grants a flat XP amount (event rewards) by reusing `progression.grantBattleXp`'s per-dino leveling via a synthetic single-"enemy" level that reproduces `amount` exactly. */
export function grantFlatXp(active: DinoInstance[], reserve: DinoInstance[], amount: number, skills: SkillId[]): GrantXpResult {
  const levelEquivalent = amount / ENEMY_XP_PER_LEVEL;
  return grantBattleXp({ active, reserve, defeatedEnemyLevels: [levelEquivalent], skills });
}

// ---------------------------------------------------------------------------
// Event resolution
// ---------------------------------------------------------------------------

export interface ResolvedEventChoice {
  outcome: EventOutcome;
  /** True when the choice carried a `risk` gamble and the `else` branch fired. */
  gambleFailed: boolean;
}

/** Resolves a choice's `risk` gamble (if any) against a forked Rng stream, per node — returns the outcome that actually applies. */
export function resolveEventChoice(choice: EventChoice, rng: Rng): ResolvedEventChoice {
  if (!choice.risk) return { outcome: choice.outcome, gambleFailed: false };
  const succeeded = rng.chance(choice.risk.chance);
  return succeeded ? { outcome: choice.outcome, gambleFailed: false } : { outcome: choice.risk.else, gambleFailed: true };
}

export interface EventOutcomeContext {
  /** Active pack dinos — healTeam/damageTeam/xp apply to these. */
  active: DinoInstance[];
  reserve: DinoInstance[];
  skills: SkillId[];
  tier: WorldTier;
  /** Item level for generated loot — callers typically pass the active pack's average level. */
  itemLevel: number;
  rng: Rng;
}

export interface EventOutcomeResult {
  essenceGained: number;
  lootItems: ItemInstance[];
  xp?: GrantXpResult;
  healedPercent?: number;
  damagedPercent?: number;
  /** Set when the outcome is `battle` — the caller builds the actual encounter (needs biome/pack level) and hands off to the battle screen. */
  triggersBattle?: { alpha: boolean };
}

/** Applies a resolved event outcome (post-`resolveEventChoice`) to the run. Mutates `ctx.active` HP in place for heal/damage outcomes. */
export function applyEventOutcome(outcome: EventOutcome, ctx: EventOutcomeContext): EventOutcomeResult {
  const result: EventOutcomeResult = { essenceGained: 0, lootItems: [] };
  switch (outcome.kind) {
    case 'loot':
      result.lootItems.push(generateItem({ ilvl: ctx.itemLevel, tier: ctx.tier, rng: ctx.rng, rarityBoost: outcome.rarityBoost }));
      break;
    case 'healTeam':
      for (const dino of ctx.active) dino.currentHpPercent = clamp01(dino.currentHpPercent + outcome.percent / 100);
      result.healedPercent = outcome.percent;
      break;
    case 'damageTeam':
      for (const dino of ctx.active) dino.currentHpPercent = clamp01(dino.currentHpPercent - outcome.percent / 100);
      result.damagedPercent = outcome.percent;
      break;
    case 'essence':
      result.essenceGained = outcome.amount;
      break;
    case 'battle':
      result.triggersBattle = { alpha: outcome.alpha };
      break;
    case 'xp':
      result.xp = grantFlatXp(ctx.active, ctx.reserve, outcome.amount, ctx.skills);
      break;
    case 'nothing':
      break;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Battle finish (victory/defeat) — the expedition-level consequences of a
// BattleState reaching `outcome`, kept separate from the engine itself
// (engine.ts stays combat-only; this is "what happens to the run/pack after").
// ---------------------------------------------------------------------------

export interface FinishBattleInput {
  outcome: 'victory' | 'defeat' | 'fled';
  nodeKind: Extract<NodeKind, 'battle' | 'alpha' | 'apex'>;
  biome: BiomeId;
  tier: WorldTier;
  unlockedTier: WorldTier;
  apexCleared: Record<BiomeId, WorldTier>;
  /** Levels of enemies actually defeated this battle (empty on defeat/fled). */
  defeatedEnemyLevels: number[];
  active: DinoInstance[];
  reserve: DinoInstance[];
  skills: SkillId[];
  lootFindPercent: number;
  packmaster: PackmasterState;
  /** Whole-run totals so far — only read on a non-victory outcome, to compute what's kept. */
  lootFoundSoFar: ItemInstance[];
  essenceFoundSoFar: number;
  rng: Rng;
}

export interface FinishBattleResult {
  xp?: GrantXpResult;
  masterXp?: MasterXpResult;
  loot: ItemInstance[];
  essence: number;
  /** Present (and possibly changed) only on an apex victory. */
  apexCleared?: Record<BiomeId, WorldTier>;
  /** Present only when an apex victory unlocks the next World Tier. */
  unlockedTier?: WorldTier;
  /** Present only on defeat/fled: the portion of the whole run's loot/essence kept. */
  keptLoot?: ItemInstance[];
  keptEssence?: number;
}

/**
 * Resolves the expedition-level fallout of a finished `BattleState`.
 * Victory: grants dino + packmaster XP, rolls node rewards (`rewardLoot`),
 * and — for an apex win — advances `apexCleared`/`unlockedTier`.
 * Defeat/fled: no new rewards; DESIGN §3's "keep XP and half the loot found
 * so far" — XP already happened (nothing to revoke), so this just computes
 * the kept slice of the run's accumulated loot/essence.
 */
export function finishBattle(input: FinishBattleInput): FinishBattleResult {
  if (input.outcome !== 'victory') {
    const keepPercent = defeatLootKeepPercent(input.skills);
    const keepCount = Math.floor(input.lootFoundSoFar.length * (keepPercent / 100));
    const keptLoot = input.rng.shuffle(input.lootFoundSoFar).slice(0, keepCount);
    const keptEssence = Math.round(input.essenceFoundSoFar * (keepPercent / 100));
    return { loot: [], essence: 0, keptLoot, keptEssence };
  }

  const xp = grantBattleXp({
    active: input.active,
    reserve: input.reserve,
    defeatedEnemyLevels: input.defeatedEnemyLevels,
    skills: input.skills,
  });

  const totalDinoXp = input.defeatedEnemyLevels.reduce((sum, level) => sum + ENEMY_XP_PER_LEVEL * level, 0);
  const masterXpAmount = Math.round(totalDinoXp * (MASTER_XP_SHARE_OF_BATTLE_PERCENT / 100));
  const masterXp = grantMasterXp(input.packmaster, masterXpAmount);

  const enemyLevel = input.defeatedEnemyLevels.length > 0 ? Math.max(...input.defeatedEnemyLevels) : 1;
  const { items, essence } = rewardLoot({
    nodeKind: input.nodeKind,
    tier: input.tier,
    enemyLevel,
    lootFindPercent: input.lootFindPercent,
    rng: input.rng,
  });

  const result: FinishBattleResult = { xp, masterXp, loot: items, essence };

  if (input.nodeKind === 'apex') {
    const prevBest = input.apexCleared[input.biome] ?? 0;
    const nextApexCleared: Record<BiomeId, WorldTier> = { ...input.apexCleared };
    if (input.tier > prevBest) nextApexCleared[input.biome] = input.tier;
    result.apexCleared = nextApexCleared;
    if (input.tier === input.unlockedTier && input.unlockedTier < 4) {
      result.unlockedTier = (input.unlockedTier + 1) as WorldTier;
    }
  }

  return result;
}

/** Re-exported for screens/tests that want to show "you'd keep N% of loot on defeat" without duplicating the skill-sum logic. */
export { defeatLootKeepPercent };

/** Re-exported id type, purely for call-site convenience (avoids an extra `types` import in some screens). */
export type { Uid };
