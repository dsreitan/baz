/**
 * CLAWBOUND — core type contracts.
 *
 * This file is the source of truth for every module. Implementation phases
 * build against these shapes; extend cautiously, never repurpose fields.
 * No imports, no logic — types and closed string unions only.
 */

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export type SpeciesId = string; // e.g. "emberfang"
export type MoveId = string; //    e.g. "magma_bite"
export type TraitId = string; //   e.g. "thick_hide"
export type AffixId = string; //   e.g. "of_the_tempest"
export type SkillId = string; //   e.g. "tactician_rally"
export type CommandId = string; // e.g. "rally"
export type BiomeId = string; //   e.g. "cinder_peaks"
export type EventId = string; //   e.g. "abandoned_nest"
export type AlphaModId = string; // e.g. "stoneskin"
export type Uid = string; // unique per instance, from rng, e.g. "d_x7k2..."

// ---------------------------------------------------------------------------
// Aspects (types) & roles
// ---------------------------------------------------------------------------

/** Wheel order matters: each aspect is strong vs the next 2, weak vs the previous 2. */
export const ASPECT_WHEEL = [
  'ember',
  'frost',
  'verdant',
  'stone',
  'storm',
  'tide',
  'venom',
  'rune',
] as const;
export type Aspect = (typeof ASPECT_WHEEL)[number];

export type Role = 'bruiser' | 'guardian' | 'stalker' | 'warden' | 'screecher';

/** Drives procedural body-part selection in render/dinoSvg.ts. */
export type Archetype =
  | 'raptor'
  | 'theropod'
  | 'sauropod'
  | 'ceratopsian'
  | 'stegosaur'
  | 'ankylosaur'
  | 'pterosaur'
  | 'spinosaur';

export type Stage = 'juvenile' | 'adult' | 'alpha';

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface StatBlock {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}
export type StatKey = keyof StatBlock;

// ---------------------------------------------------------------------------
// Statuses & combo states
// ---------------------------------------------------------------------------

/**
 * Closed status vocabulary. Damage-over-time: burn, poison, bleed.
 * Combo states (consumed by moves for bonuses): soak, chill, knockdown, charged.
 * Control/utility: stun, taunt, harden, regen, enrage, slow.
 */
export type StatusId =
  | 'burn'
  | 'poison'
  | 'bleed'
  | 'soak'
  | 'chill'
  | 'knockdown'
  | 'charged'
  | 'stun'
  | 'taunt'
  | 'harden'
  | 'regen'
  | 'enrage'
  | 'slow';

export interface ActiveStatus {
  id: StatusId;
  turnsLeft: number;
  /** magnitude, meaning depends on status (dot % of maxHp, stat % for harden/enrage/slow) */
  power: number;
}

// ---------------------------------------------------------------------------
// Moves — content described by a closed effect vocabulary, interpreted by engine
// ---------------------------------------------------------------------------

export type TargetSpec = 'enemy' | 'all-enemies' | 'ally' | 'all-allies' | 'self';

export type MoveEffect =
  | { kind: 'damage'; power: number } // power ~ 40..120
  | { kind: 'applyStatus'; status: StatusId; chance: number; turns: number; power: number }
  | { kind: 'heal'; percentMaxHp: number }
  | { kind: 'buff'; stat: StatKey; percent: number; turns: number }
  | { kind: 'debuff'; stat: StatKey; percent: number; turns: number }
  | { kind: 'cleanse' } // remove negative statuses from target
  | { kind: 'shield'; percentMaxHp: number } // absorb pool until broken
  | { kind: 'priority' }; // marker: acts first in round regardless of SPD

export interface ComboSpec {
  /** status consumed from the TARGET when this move hits */
  consumes: StatusId;
  /** e.g. 0.5 = +50% damage; special keys below */
  bonusDamage?: number;
  guaranteedCrit?: boolean;
  ignoreDef?: boolean;
}

export interface MoveDef {
  id: MoveId;
  name: string;
  aspect: Aspect;
  category: 'strike' | 'guard' | 'support' | 'debuff';
  targets: TargetSpec;
  accuracy: number; // 0..1, support/self moves use 1
  cooldown: number; // 0 = every turn; 2 = usable every 3rd turn
  effects: MoveEffect[];
  combo?: ComboSpec;
  description: string; // human text, shown in UI
}

// ---------------------------------------------------------------------------
// Species & individual dinos
// ---------------------------------------------------------------------------

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  aspect: Aspect;
  role: Role;
  archetype: Archetype;
  /** stats at level 1 (hp ~ 50-80, others ~ 10-20) */
  baseStats: StatBlock;
  /** added per level (hp ~ 4-8, others ~ 1-2.5) */
  growth: StatBlock;
  learnset: { level: number; move: MoveId }[]; // sorted by level, first entry level 1
  traitPool: TraitId[]; // individual rolls exactly one
  tameDifficulty: number; // 0.5 easy .. 1.5 very hard, multiplies tame chance down
  isBoss?: boolean; // apex species: not tameable, not in wild pools
  flavor: string;
}

export interface TraitDef {
  id: TraitId;
  name: string;
  description: string;
  /** interpreted by stats.ts / engine; closed vocabulary */
  effect:
    | { kind: 'statPercent'; stat: StatKey; percent: number }
    | { kind: 'aspectDamage'; aspect: Aspect; percent: number }
    | { kind: 'statusResist'; status: StatusId; percent: number }
    | { kind: 'onHitStatus'; status: StatusId; chance: number; turns: number; power: number }
    | { kind: 'critChance'; percent: number }
    | { kind: 'comboDamage'; percent: number }; // extra combo-consumption bonus
}

export interface DinoInstance {
  uid: Uid;
  species: SpeciesId;
  nickname: string; // defaults to species name
  level: number; // 1..30
  xp: number; // within current level
  quirk: { stat: StatKey; percent: number }; // +5..10
  trait: TraitId;
  /** alpha-tamed dinos keep one modifier as a bonus trait */
  alphaTrait?: AlphaModId;
  moves: MoveId[]; // 1..4, subset of learnset at current level
  gear: Partial<Record<DinoGearSlot, ItemInstance>>;
  /** seed for procedural appearance (pattern, decoration variant) */
  appearanceSeed: number;
  /** persistent between battles within an expedition; healed at camp/grove */
  currentHpPercent: number; // 0..1
}

// ---------------------------------------------------------------------------
// Items & gear
// ---------------------------------------------------------------------------

export type DinoGearSlot = 'plating' | 'talon' | 'charm';
export type MasterGearSlot = 'whistle' | 'satchel' | 'standard';
export type GearSlot = DinoGearSlot | MasterGearSlot;

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface AffixDef {
  id: AffixId;
  /** name fragment, e.g. "of the Tempest"; item names compose base + fragments */
  nameFragment: string;
  slots: GearSlot[]; // which slots this affix may roll on
  /** value ranges scale with item level; engine interprets */
  effect:
    | { kind: 'statPercent'; stat: StatKey; min: number; max: number }
    | { kind: 'statFlat'; stat: StatKey; min: number; max: number }
    | { kind: 'aspectDamage'; aspect: Aspect; min: number; max: number }
    | { kind: 'onHitStatus'; status: StatusId; chanceMin: number; chanceMax: number; turns: number; power: number }
    | { kind: 'critChance'; min: number; max: number }
    | { kind: 'comboDamage'; min: number; max: number }
    | { kind: 'tameChance'; min: number; max: number } // master gear
    | { kind: 'lootFind'; min: number; max: number } //  master gear
    | { kind: 'commandPower'; min: number; max: number } // master gear (whistle)
    | { kind: 'teamStatPercent'; stat: StatKey; min: number; max: number }; // standard aura
}

export interface RolledAffix {
  affix: AffixId;
  value: number; // rolled within def range, scaled by ilvl
}

export interface ItemInstance {
  uid: Uid;
  slot: GearSlot;
  rarity: Rarity;
  ilvl: number; // item level ~ enemy level at drop
  name: string; // generated: e.g. "Ironjaw Talon of the Tempest"
  affixes: RolledAffix[];
  /** legendary-only unique power, from a small closed table in data/items.ts */
  legendaryPower?: string;
}

// ---------------------------------------------------------------------------
// Packmaster
// ---------------------------------------------------------------------------

export interface SkillDef {
  id: SkillId;
  branch: 'tactician' | 'handler' | 'survivalist';
  tier: number; // 1..3, tier n+1 requires any tier-n node in branch
  name: string;
  description: string;
  /** interpreted by progression.ts / engine */
  effect:
    | { kind: 'unlockCommand'; command: CommandId }
    | { kind: 'commandBonus'; command: CommandId; percent: number }
    | { kind: 'tameChance'; percent: number }
    | { kind: 'reserveSize'; plus: number }
    | { kind: 'benchXpShare'; percent: number }
    | { kind: 'lootFind'; percent: number }
    | { kind: 'defeatLootKeep'; percent: number }
    | { kind: 'essenceYield'; percent: number }
    | { kind: 'mapReveal'; plus: number }
    | { kind: 'groveHealBonus'; percent: number };
}

export interface CommandDef {
  id: CommandId;
  name: string;
  description: string;
  /** interpreted by battle engine */
  effect:
    | { kind: 'teamBuff'; stat: StatKey; percent: number } // this round
    | { kind: 'healTarget'; percentMaxHp: number }
    | { kind: 'lure' } // next tame attempt this battle gets bonus
    | { kind: 'freeSwap' }
    | { kind: 'resetCooldowns'; target: 'one' }
    | { kind: 'cleanseTeam' };
}

export interface PackmasterState {
  name: string;
  level: number; // 1..20
  xp: number;
  skillPoints: number;
  skills: SkillId[];
  gear: Partial<Record<MasterGearSlot, ItemInstance>>;
}

// ---------------------------------------------------------------------------
// Expeditions
// ---------------------------------------------------------------------------

export type WorldTier = 1 | 2 | 3 | 4;

export type NodeKind = 'battle' | 'alpha' | 'event' | 'grove' | 'cache' | 'apex';

export interface MapNode {
  id: number;
  layer: number; // 0..4, apex alone on final layer
  kind: NodeKind;
  /** node ids in the NEXT layer reachable from here */
  next: number[];
  visited: boolean;
  /** set for event nodes at generation time */
  eventId?: EventId;
}

export interface ExpeditionState {
  biome: BiomeId;
  tier: WorldTier;
  seed: number;
  nodes: MapNode[];
  /** current node id, or -1 before first pick */
  at: number;
  /** loot found this run (kept in full on apex kill, portion on defeat) */
  lootFound: ItemInstance[];
  essenceFound: number;
  tamedThisRun: Uid[];
}

export interface BiomeDef {
  id: BiomeId;
  name: string;
  description: string;
  aspectBias: Aspect[]; // wild pools weight these aspects
  speciesPool: SpeciesId[];
  apexSpecies: SpeciesId;
  /** css-friendly palette for map background */
  palette: { bg: string; accent: string };
}

export interface EventDef {
  id: EventId;
  title: string;
  text: string;
  choices: {
    label: string;
    /** closed outcome vocabulary, resolved by expedition runner */
    outcome:
      | { kind: 'loot'; rarityBoost: number }
      | { kind: 'healTeam'; percent: number }
      | { kind: 'damageTeam'; percent: number }
      | { kind: 'essence'; amount: number }
      | { kind: 'battle'; alpha: boolean }
      | { kind: 'xp'; amount: number }
      | { kind: 'nothing' };
    /** optional gamble: [chance of first outcome, else second] */
    risk?: { chance: number; else: { kind: 'damageTeam'; percent: number } | { kind: 'nothing' } };
  }[];
}

export interface AlphaModDef {
  id: AlphaModId;
  name: string; // prefix, e.g. "Stoneskin"
  description: string;
  effect:
    | { kind: 'statPercent'; stat: StatKey; percent: number }
    | { kind: 'onHitStatus'; status: StatusId; chance: number; turns: number; power: number }
    | { kind: 'statusImmune' }
    | { kind: 'thorns'; percent: number } // reflect % of damage taken
    | { kind: 'summonAdd' } // battle starts with +1 wild ally
    | { kind: 'frenzy' }; // +30% atk & spd below 50% hp
}

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------

export type Side = 'player' | 'enemy';

export interface Combatant {
  uid: Uid; // dino uid for player side; generated for wild
  side: Side;
  species: SpeciesId;
  nickname: string;
  level: number;
  stage: Stage;
  /** snapshot including gear/quirk/trait/bond/tier scaling, taken at battle start */
  stats: StatBlock;
  currentHp: number;
  shield: number;
  statuses: ActiveStatus[];
  cooldowns: Record<MoveId, number>;
  moves: MoveId[];
  trait: TraitId;
  alphaMods: AlphaModId[]; // wild alphas/boss only
  appearanceSeed: number;
  /** wild only: eligible for taming */
  tameable: boolean;
  fainted: boolean;
}

export type BattleKind = 'wild' | 'alpha' | 'apex';

export interface PackBond {
  kind: 'aspect' | 'role' | 'balanced';
  label: string; // e.g. "Ember Bond", "Guardian Bond", "Balanced Pack"
  detail: string;
}

export interface BattleState {
  kind: BattleKind;
  round: number;
  combatants: Combatant[];
  /** uids in SPD order for current round, priority moves handled by engine */
  turnQueue: Uid[];
  /** index into turnQueue */
  turnIndex: number;
  playerBonds: PackBond[];
  enemyBonds: PackBond[];
  commandUsedThisRound: boolean;
  lureActive: boolean;
  /** commands available this battle (from packmaster skills) */
  commands: CommandId[];
  outcome?: 'victory' | 'defeat' | 'fled';
  /** uid of wild dino tamed mid-battle, removed from field */
  tamed?: Uid;
}

export type BattleAction =
  | { type: 'move'; move: MoveId; target: Uid }
  | { type: 'swap'; withDino: Uid } // reserve dino uid
  | { type: 'guard' } // +50% def until next turn, clears 1 turn off cooldowns
  | { type: 'tame' } // acting dino spends turn; target = lowest-hp tameable enemy
  | { type: 'command'; command: CommandId; target?: Uid }; // does NOT consume turn

/** Events emitted by the engine; UI renders/animates from these. */
export type BattleEvent =
  | { e: 'roundStart'; round: number }
  | { e: 'turnStart'; uid: Uid }
  | { e: 'moveUsed'; uid: Uid; move: MoveId; targets: Uid[] }
  | { e: 'damage'; uid: Uid; amount: number; crit: boolean; effective: 'strong' | 'weak' | 'neutral' }
  | { e: 'comboConsumed'; uid: Uid; status: StatusId; bonus: string }
  | { e: 'heal'; uid: Uid; amount: number }
  | { e: 'shield'; uid: Uid; amount: number }
  | { e: 'statusApplied'; uid: Uid; status: StatusId; turns: number }
  | { e: 'statusExpired'; uid: Uid; status: StatusId }
  | { e: 'statusTick'; uid: Uid; status: StatusId; amount: number }
  | { e: 'buff'; uid: Uid; stat: StatKey; percent: number }
  | { e: 'miss'; uid: Uid; move: MoveId }
  | { e: 'faint'; uid: Uid }
  | { e: 'swap'; outUid: Uid; inUid: Uid }
  | { e: 'guard'; uid: Uid }
  | { e: 'tameAttempt'; uid: Uid; chance: number; success: boolean }
  | { e: 'command'; command: CommandId; target?: Uid }
  | { e: 'battleEnd'; outcome: 'victory' | 'defeat' | 'fled' };

// ---------------------------------------------------------------------------
// Top-level game state & save
// ---------------------------------------------------------------------------

export interface GameStats {
  expeditionsCompleted: number;
  apexKills: number;
  dinosTamed: number;
  battlesWon: number;
}

export interface GameState {
  packmaster: PackmasterState;
  dinos: DinoInstance[]; // all owned
  activePack: Uid[]; // exactly 1..3 dino uids
  inventory: ItemInstance[];
  essence: number;
  unlockedTier: WorldTier; // highest unlocked
  /** biomes whose apex was killed, per tier, e.g. { cinder_peaks: 2 } = beaten on tier 2 */
  apexCleared: Record<BiomeId, WorldTier>;
  stats: GameStats;
  expedition?: ExpeditionState; // present while on expedition
  /** master seed; per-system seeds derive from it */
  seed: number;
}

export interface SaveGame {
  version: number; // bump on breaking change; save.ts migrates
  savedAt: string; // ISO timestamp, set by UI layer (core never calls Date)
  state: GameState;
}

// ---------------------------------------------------------------------------
// RNG contract
// ---------------------------------------------------------------------------

export interface Rng {
  /** float in [0, 1) */
  next(): number;
  /** integer in [min, max] inclusive */
  int(min: number, max: number): number;
  /** true with probability p */
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  /** derive an independent child stream (e.g. per expedition node) */
  fork(label: string): Rng;
}
