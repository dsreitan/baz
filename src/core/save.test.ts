import { describe, expect, it } from 'vitest';
import type { GameState } from './types';
import {
  SAVE_VERSION,
  deleteSlot,
  deserializeSave,
  exportSave,
  importSave,
  loadFromSlot,
  saveToSlot,
  serializeSave,
  type StorageLike,
} from './save';

/** In-memory mock of the StorageLike contract, for tests. */
function createMockStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function sampleState(seed: number, name = 'Test Packmaster'): GameState {
  return {
    packmaster: {
      name,
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

describe('serializeSave / deserializeSave', () => {
  it('round-trips a GameState through JSON', () => {
    const state = sampleState(42);
    const raw = serializeSave(state, '2026-01-01T00:00:00.000Z');
    const result = deserializeSave(raw);

    expect(result).not.toBeNull();
    expect(result?.version).toBe(SAVE_VERSION);
    expect(result?.savedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result?.state).toEqual(state);
  });

  it('returns null for malformed JSON instead of throwing', () => {
    expect(() => deserializeSave('{ not valid json')).not.toThrow();
    expect(deserializeSave('{ not valid json')).toBeNull();
  });

  it('returns null for well-formed JSON that is not save-shaped', () => {
    expect(deserializeSave(JSON.stringify({ foo: 'bar' }))).toBeNull();
    expect(deserializeSave(JSON.stringify({ version: 1, savedAt: 'x' }))).toBeNull(); // missing state
    expect(deserializeSave(JSON.stringify([1, 2, 3]))).toBeNull();
    expect(deserializeSave('null')).toBeNull();
    expect(deserializeSave('42')).toBeNull();
    expect(deserializeSave('"just a string"')).toBeNull();
  });

  it('returns null for an unknown future version (no migration path)', () => {
    const raw = JSON.stringify({ version: 999, savedAt: 'x', state: {} });
    expect(deserializeSave(raw)).toBeNull();
  });
});

describe('saveToSlot / loadFromSlot', () => {
  it('round-trips through a mock storage backend', () => {
    const storage = createMockStorage();
    const state = sampleState(7);
    saveToSlot(storage, 0, state, '2026-02-02T00:00:00.000Z');

    const loaded = loadFromSlot(storage, 0);
    expect(loaded).not.toBeNull();
    expect(loaded?.state).toEqual(state);
    expect(loaded?.savedAt).toBe('2026-02-02T00:00:00.000Z');
  });

  it('returns null for an empty slot', () => {
    const storage = createMockStorage();
    expect(loadFromSlot(storage, 1)).toBeNull();
  });

  it('returns null (does not throw) for out-of-range slot indices', () => {
    const storage = createMockStorage();
    expect(loadFromSlot(storage, -1)).toBeNull();
    expect(loadFromSlot(storage, 3)).toBeNull();
    expect(loadFromSlot(storage, 1.5)).toBeNull();
    expect(() => saveToSlot(storage, 3, sampleState(1), 'x')).toThrow();
  });

  it('keeps the 3 slots isolated from each other', () => {
    const storage = createMockStorage();
    saveToSlot(storage, 0, sampleState(1, 'Slot Zero'), 'a');
    saveToSlot(storage, 1, sampleState(2, 'Slot One'), 'b');
    saveToSlot(storage, 2, sampleState(3, 'Slot Two'), 'c');

    expect(loadFromSlot(storage, 0)?.state.packmaster.name).toBe('Slot Zero');
    expect(loadFromSlot(storage, 1)?.state.packmaster.name).toBe('Slot One');
    expect(loadFromSlot(storage, 2)?.state.packmaster.name).toBe('Slot Two');

    deleteSlot(storage, 1);
    expect(loadFromSlot(storage, 1)).toBeNull();
    // Deleting slot 1 must not disturb slots 0 or 2.
    expect(loadFromSlot(storage, 0)?.state.packmaster.name).toBe('Slot Zero');
    expect(loadFromSlot(storage, 2)?.state.packmaster.name).toBe('Slot Two');
  });

  it('returns null when the stored value for a slot is corrupt', () => {
    const storage = createMockStorage();
    storage.setItem('clawbound:slot:0', 'not even json{{{');
    expect(loadFromSlot(storage, 0)).toBeNull();
  });
});

describe('exportSave / importSave', () => {
  it('round-trips a save through base64', () => {
    const state = sampleState(123, 'Exported Packmaster');
    const raw = serializeSave(state, '2026-03-03T00:00:00.000Z');
    const save = deserializeSave(raw)!;

    const exported = exportSave(save);
    expect(typeof exported).toBe('string');
    // Base64 alphabet only.
    expect(exported).toMatch(/^[A-Za-z0-9+/]+=*$/);

    const imported = importSave(exported);
    expect(imported).toEqual(save);
  });

  it('handles non-ASCII text in the round trip (base64 must be UTF-8 safe)', () => {
    const state = sampleState(9, 'Träumer of Sauria 🦖');
    const raw = serializeSave(state, '2026-04-04T00:00:00.000Z');
    const save = deserializeSave(raw)!;

    const exported = exportSave(save);
    const imported = importSave(exported);
    expect(imported?.state.packmaster.name).toBe('Träumer of Sauria 🦖');
  });

  it('returns null (does not throw) for garbage base64 input', () => {
    expect(() => importSave('not-base64!!! ###')).not.toThrow();
    expect(importSave('not-base64!!! ###')).toBeNull();
    expect(importSave('')).toBeNull();
  });
});
