/**
 * Boot entry point: load (or create) game state, wire up the ScreenManager,
 * and push the placeholder MainMenu. Phase 1 only needs to prove this
 * pipeline works end to end; the real new-game flow lands in Phase 6.
 *
 * Phase 5 adds two dev-only hash routes, guarded so the normal boot path is
 * completely unaffected when the hash is empty:
 *  - `#gallery` — the procedural-art review grid (src/render/gallery.ts).
 *  - `#battle`  — a manually playable demo battle (starter trio lvl 6 vs a
 *    generated tier-1 Cinder Peaks encounter) driving the real battle
 *    screen/engine, so Phase 5 can be played without waiting for Phase 6's
 *    camp/expedition wiring.
 */
import { createBattle } from './core/battle/engine';
import { generateEncounter, generateStarter } from './core/gen/dino';
import { loadFromSlot, localStorageAdapter, saveToSlot } from './core/save';
import { createRng } from './core/rng';
import type { DinoInstance, GameState, MoveId, SpeciesDef } from './core/types';
import { BIOME_LIST, DEFAULT_COMMANDS, SPECIES, STARTER_SPECIES } from './data/index';
import { toast } from './ui/dom';
import { gallerySvg } from './render/gallery';
import { ScreenManager } from './ui/screenManager';
import type { GameContext } from './ui/screenManager';
import { battleScreen } from './ui/screens/battleScreen';
import { mainMenu } from './ui/screens/mainMenu';

const ACTIVE_SLOT = 0;
const DEMO_STARTER_LEVEL = 6;

/** Placeholder state for an empty save — Phase 4/6 own real new-game creation. */
function createPlaceholderState(seed: number): GameState {
  return {
    packmaster: {
      name: 'Packmaster',
      level: 1,
      xp: 0,
      skillPoints: 0,
      skills: [],
      gear: {},
    },
    dinos: [],
    activePack: [],
    inventory: [],
    essence: 0,
    unlockedTier: 1,
    apexCleared: {},
    stats: {
      expeditionsCompleted: 0,
      apexKills: 0,
      dinosTamed: 0,
      battlesWon: 0,
    },
    seed,
  };
}

/** Mirrors gen/dino.ts's private `movesAtLevel` (not exported — see Phase 5 report). */
function movesAtLevel(species: SpeciesDef, level: number): MoveId[] {
  return species.learnset
    .filter((entry) => entry.level <= level)
    .map((entry) => entry.move)
    .slice(-4);
}

/** `#battle` dev route: starter trio at a fixed demo level vs a generated tier-1 encounter. */
function buildDemoBattle(): { playerDinos: DinoInstance[]; reserve: DinoInstance[]; battle: ReturnType<typeof createBattle> } {
  const rng = createRng(Date.now() >>> 0);
  const playerDinos: DinoInstance[] = STARTER_SPECIES.map((id) => {
    const species = SPECIES[id];
    const starter = generateStarter(id, rng);
    return species ? { ...starter, level: DEMO_STARTER_LEVEL, moves: movesAtLevel(species, DEMO_STARTER_LEVEL) } : starter;
  });
  const enemies = generateEncounter({
    biome: BIOME_LIST[0]!.id,
    tier: 1,
    packAvgLevel: DEMO_STARTER_LEVEL,
    kind: 'battle',
    rng,
  });
  const battle = createBattle(
    { kind: 'wild', playerDinos, reserve: [], enemies, commands: DEFAULT_COMMANDS, skills: [], masterGear: {} },
    rng,
  );
  return { playerDinos, reserve: [], battle };
}

/** `#battle` dev route: mounts the battle screen directly with a throwaway GameContext. */
function mountDemoBattle(appRoot: HTMLElement): void {
  const { playerDinos, reserve, battle } = buildDemoBattle();
  const screen = battleScreen({
    battle,
    playerDinos,
    reserve,
    onFinish: (result) => {
      toast(`Battle finished: ${result.outcome}${result.tamedUid ? ' — tamed a dino!' : ''}`);
    },
  });
  const ctx: GameContext = {
    state: createPlaceholderState(Date.now()),
    save: () => {},
    goto: () => {},
    back: () => {},
  };
  screen.mount(appRoot, ctx);
}

/** `#gallery` dev route: dumps the full art-review grid straight into `#app`. */
function mountGallery(appRoot: HTMLElement): void {
  appRoot.innerHTML = gallerySvg();
}

function boot(): void {
  const appRoot = document.getElementById('app');
  if (!appRoot) {
    throw new Error('main.ts: could not find #app root element');
  }

  if (location.hash === '#gallery') {
    mountGallery(appRoot);
    return;
  }
  if (location.hash === '#battle') {
    mountDemoBattle(appRoot);
    return;
  }

  const existing = loadFromSlot(localStorageAdapter, ACTIVE_SLOT);
  const state = existing?.state ?? createPlaceholderState(Date.now());

  const save = (): void => {
    saveToSlot(localStorageAdapter, ACTIVE_SLOT, state, new Date().toISOString());
  };

  const manager = new ScreenManager(appRoot, state, save);
  manager.push(mainMenu);
}

boot();
