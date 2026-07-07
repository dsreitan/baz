/**
 * Phase 7 addition: shared `?seed=<number>` override helper.
 *
 * The Phase 6 brief sanctioned exactly one `Date.now()` use per screen (the
 * "UI may use Date.now for the initial seed" rule) — but that meant every
 * screen that legitimately needs a fresh Rng at mount time (new-game
 * creation in `mainMenu.ts`, and per-battle rng in `battleScreen.ts`) seeded
 * itself from wall-clock time independently, so a fixed `?seed=` on New Game
 * alone did NOT make a full playthrough (including in-battle rng: crits,
 * variance, AI randomness) deterministic end to end.
 *
 * This tiny, additive helper closes that gap for automation/smoke-testing
 * (a fixed seed drives an otherwise-identical playthrough every time) without
 * changing normal play: absent/invalid `?seed=`, every caller still falls
 * back to `Date.now()`, unchanged.
 */
export function dateOrUrlSeed(): number {
  const raw = new URLSearchParams(location.search).get('seed');
  if (raw != null) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n >>> 0;
  }
  return Date.now() >>> 0;
}
