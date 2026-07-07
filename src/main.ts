/**
 * Boot entry point: load (or create) game state, wire up the ScreenManager,
 * and push the placeholder MainMenu. Phase 1 only needs to prove this
 * pipeline works end to end; the real new-game flow lands in Phase 6.
 */
import { loadFromSlot, localStorageAdapter, saveToSlot } from './core/save';
import type { GameState } from './core/types';
import { ScreenManager } from './ui/screenManager';
import { mainMenu } from './ui/screens/mainMenu';

const ACTIVE_SLOT = 0;

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

function boot(): void {
  const appRoot = document.getElementById('app');
  if (!appRoot) {
    throw new Error('main.ts: could not find #app root element');
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
