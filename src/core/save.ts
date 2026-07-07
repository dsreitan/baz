/**
 * Save system — (de)serializes `SaveGame` to/from a pluggable storage
 * backend, 3 slots, version migration, and base64 export/import for
 * sharing saves between browsers.
 *
 * Storage is injected (`StorageLike`) so tests can mock it; production
 * code uses `localStorageAdapter`, a thin wrapper over the browser's
 * `localStorage`. No direct DOM access happens here — only the Web
 * Storage API surface described by `StorageLike`.
 */
import type { GameState, SaveGame } from './types';

/** Bump on any breaking change to `GameState`'s shape; add a migration below. */
export const SAVE_VERSION = 1;

export const SAVE_SLOT_COUNT = 3;

/** Minimal storage contract — a subset of `Storage` (localStorage/sessionStorage). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Production storage backend: the browser's localStorage. */
export const localStorageAdapter: StorageLike = {
  getItem(key) {
    return globalThis.localStorage.getItem(key);
  },
  setItem(key, value) {
    globalThis.localStorage.setItem(key, value);
  },
  removeItem(key) {
    globalThis.localStorage.removeItem(key);
  },
};

const SLOT_KEY_PREFIX = 'clawbound:slot:';

function slotKey(slot: number): string {
  return `${SLOT_KEY_PREFIX}${slot}`;
}

function isValidSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < SAVE_SLOT_COUNT;
}

/** Structural check that `parsed` is at least shaped like a `SaveGame`. */
function isSaveGameShape(parsed: unknown): parsed is SaveGame {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const candidate = parsed as Record<string, unknown>;
  return (
    typeof candidate['version'] === 'number' &&
    typeof candidate['savedAt'] === 'string' &&
    typeof candidate['state'] === 'object' &&
    candidate['state'] !== null
  );
}

/**
 * Migration ladder stub. Each future breaking change adds a `case` that
 * upgrades one version forward and falls through to the next case, so a
 * very old save walks the whole ladder up to `SAVE_VERSION`.
 */
function migrateSave(save: SaveGame): SaveGame | null {
  switch (save.version) {
    case SAVE_VERSION:
      return save;
    // case 1:
    //   save = migrateV1ToV2(save);
    //   // fall through
    default:
      // Newer-than-known or no migration path from this version: refuse to
      // guess at the shape rather than risk corrupting game state.
      return null;
  }
}

/** Serialize a `GameState` into a versioned `SaveGame` JSON string. */
export function serializeSave(state: GameState, savedAt: string): string {
  const save: SaveGame = { version: SAVE_VERSION, savedAt, state };
  return JSON.stringify(save);
}

/**
 * Parse and migrate a raw JSON string into a `SaveGame`.
 * Returns null (never throws) if the data is malformed or unmigratable.
 */
export function deserializeSave(raw: string): SaveGame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isSaveGameShape(parsed)) return null;
  return migrateSave(parsed);
}

/** Write `state` to a save slot (0-based, < SAVE_SLOT_COUNT). */
export function saveToSlot(
  storage: StorageLike,
  slot: number,
  state: GameState,
  savedAt: string,
): void {
  if (!isValidSlot(slot)) {
    throw new Error(`Invalid save slot: ${slot}`);
  }
  storage.setItem(slotKey(slot), serializeSave(state, savedAt));
}

/** Read and migrate a save slot. Returns null if empty, corrupt, or out of range. */
export function loadFromSlot(storage: StorageLike, slot: number): SaveGame | null {
  if (!isValidSlot(slot)) return null;
  const raw = storage.getItem(slotKey(slot));
  if (raw === null) return null;
  return deserializeSave(raw);
}

/** Clear a save slot. No-op if already empty or slot is out of range. */
export function deleteSlot(storage: StorageLike, slot: number): void {
  if (!isValidSlot(slot)) return;
  storage.removeItem(slotKey(slot));
}

// ---------------------------------------------------------------------------
// Export / import — base64-encoded JSON, for sharing saves between browsers.
// ---------------------------------------------------------------------------

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToUtf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/** Encode a `SaveGame` as a base64 string suitable for copy/paste sharing. */
export function exportSave(save: SaveGame): string {
  return utf8ToBase64(JSON.stringify(save));
}

/** Decode a base64-exported save. Returns null (never throws) if invalid. */
export function importSave(base64: string): SaveGame | null {
  let json: string;
  try {
    json = base64ToUtf8(base64);
  } catch {
    return null;
  }
  return deserializeSave(json);
}
