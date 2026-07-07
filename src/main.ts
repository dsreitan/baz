/**
 * Boot entry point: wire up storage, the ScreenManager, and push MainMenu
 * (ARCHITECTURE §4 screen flow — the game always opens on MainMenu; slots
 * that are mid-expedition show a badge there instead of deep-linking).
 *
 * `state` below is a single long-lived `GameState` object for the whole
 * session. Screens (starting with MainMenu's New Game/Load Game flows)
 * populate it via `Object.assign(ctx.state, freshOrLoadedState)` — never by
 * reassigning `ctx.state` itself — so that the `save` closure created here,
 * which captures this exact object by reference, always persists whatever
 * the player is currently doing. `activeSlot` gets the same "shared mutable
 * box" treatment (see `ui/screenManager.ts`'s `ActiveSlotRef` doc) so
 * `save()` writes to whichever slot MainMenu most recently selected.
 *
 * Dev-only hash routes (unchanged from Phase 5, guarded so an empty hash
 * doesn't affect normal boot):
 *  - `#gallery` — the procedural-art review grid (src/render/gallery.ts).
 *  - `#battle`  — a manually playable demo battle, useful for poking at the
 *    battle screen/engine without going through the full menu → camp →
 *    expedition flow.
 */
import { createBattle } from './core/battle/engine';
import { generateEncounter, generateStarter, movesAtLevel } from './core/gen/dino';
import { loadFromSlot, localStorageAdapter, saveToSlot, SAVE_SLOT_COUNT } from './core/save';
import { createRng } from './core/rng';
import type { DinoInstance, GameState } from './core/types';
import { BIOME_LIST, DEFAULT_COMMANDS, SPECIES, STARTER_SPECIES } from './data/index';
import { toast } from './ui/dom';
import { gallerySvg } from './render/gallery';
import { ScreenManager } from './ui/screenManager';
import type { ActiveSlotRef, GameContext } from './ui/screenManager';
import { battleScreen } from './ui/screens/battleScreen';
import { mainMenu } from './ui/screens/mainMenu';

const DEMO_STARTER_LEVEL = 6;

/** Empty session placeholder — MainMenu's New Game/Load Game overwrite this in place before Camp ever reads it. */
function createEmptyState(seed: number): GameState {
  return {
    packmaster: { name: 'Packmaster', level: 1, xp: 0, skillPoints: 0, skills: [], gear: {} },
    dinos: [],
    activePack: [],
    inventory: [],
    essence: 0,
    unlockedTier: 1,
    apexCleared: {},
    stats: { expeditionsCompleted: 0, apexKills: 0, dinosTamed: 0, battlesWon: 0 },
    seed,
  };
}

/** Slot index whose save has the most recent `savedAt`, or 0 if every slot is empty/corrupt. */
function mostRecentSlot(): number {
  let best = 0;
  let bestTime = '';
  for (let slot = 0; slot < SAVE_SLOT_COUNT; slot++) {
    const save = loadFromSlot(localStorageAdapter, slot);
    if (save && save.savedAt > bestTime) {
      bestTime = save.savedAt;
      best = slot;
    }
  }
  return best;
}

/** `#battle` dev route: starter trio at a fixed demo level vs a generated tier-1 Cinder Peaks encounter. */
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
    state: createEmptyState(Date.now()),
    activeSlot: { value: 0 },
    save: () => {},
    goto: () => {},
    replace: () => {},
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

  const state = createEmptyState(Date.now());
  const activeSlot: ActiveSlotRef = { value: mostRecentSlot() };

  const save = (): void => {
    saveToSlot(localStorageAdapter, activeSlot.value, state, new Date().toISOString());
  };

  const manager = new ScreenManager(appRoot, state, activeSlot, save);
  manager.push(mainMenu);
}

boot();
