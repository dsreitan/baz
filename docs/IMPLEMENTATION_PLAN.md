# CLAWBOUND — Implementation Plan

Phases are executed **in order** by implementation agents. Each phase brief below is self-contained; agents must read `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, and `src/core/types.ts` before writing code.

## Ground rules for every phase

1. `src/core/types.ts` is the contract. If a shape seems wrong, adapt your code, not the types — flag friction in your final report instead.
2. `src/core` and `src/data`: **no DOM, no `Math.random`, no `Date`**. Randomness only through the `Rng` interface.
3. Dependencies: `vite`, `typescript`, `vitest` only.
4. TypeScript strict; `npm run check` (tsc --noEmit) and `npm test` must pass before committing.
5. Commit at the end of the phase with a descriptive message.
6. Keep functions small and named for what they do; content tables formatted one-entry-per-block for diffability.

## Phase 1 — Scaffold & foundations

- Vite vanilla-ts scaffold at repo root: `index.html`, `vite.config.ts` (`base: '/baz/'`), `tsconfig.json` (strict), `package.json` scripts: `dev`, `build`, `check`, `test`.
- `src/core/rng.ts`: mulberry32-based implementation of the `Rng` interface, `fork` via hashing label into a new seed. Deterministic tests.
- `src/core/typeChart.ts`: `aspectMultiplier(attacker, defender)` from wheel order (+2 clockwise = 1.5, −2 = 0.67). Tests for all 8×8.
- `src/core/save.ts`: serialize/deserialize `SaveGame` ↔ localStorage (3 slots), version constant, migration stub, export/import via base64 JSON. Tests with a mocked storage.
- `src/ui/screenManager.ts` + `src/ui/dom.ts` (element helper `el(tag, attrs, ...children)`, modal, toast, tooltip).
- `src/styles/main.css`: design tokens (colors incl. 8 aspect palettes, spacing, panel/button styles per DESIGN §8) + base layout. Dark parchment/stone theme.
- `src/main.ts`: boots to a placeholder MainMenu proving the screen manager works.

## Phase 2 — Content data

All of `src/data/`, exactly matching `types.ts` shapes, cross-referenced IDs only (a test validates referential integrity: every learnset move exists, every species trait exists, every biome species exists, etc.).

- `species.ts`: 18 tameable species (aspect/role/archetype spread per DESIGN §4.6) + 6 apex boss species (one per biome, `isBoss`). Stat budgets: role-appropriate, total base ≈ equal.
- `moves.ts`: ~48 moves: per aspect ≈ 6, mix of categories, cooldown 0–3, at least one combo-consumer and one combo-applier per aspect. Include DESIGN's examples (soak→storm, chill→crit, knockdown→ignoreDef).
- `traits.ts` (~16), `alphaMods.ts` (6 per types), `affixes.ts` (~40 across slots), `items.ts` (base names per slot + 6 legendary powers + rarity weight tables per tier), `skills.ts` (18 nodes: 3 branches × 3 tiers × 2) + `commands.ts` content for 6 commands (rally, field_dressing, throw_lure, recall, focus, cleanse — first two unlocked by default at level 1).
- `biomes.ts` (6 per DESIGN §7), `events.ts` (10 events, risk/reward per `EventDef`), `strings.ts` (game title + UI strings).

## Phase 3 — Battle engine & core logic

- `src/core/stats.ts`: derived stats from species/level/quirk/trait/gear/stage(+10% adult, +25% alpha)/world-tier enemy scaling; bond computation (`computeBonds(pack)`).
- `src/core/battle/engine.ts`: `createBattle(config, rng)`, `legalActions(state)`, `applyAction(state, action, rng): BattleEvent[]`, `isBattleOver(state)`. Turn queue, rounds, guard, swap, command (once/round, no turn cost), end-of-round status ticks, damage formula per ARCHITECTURE §5 with constants in `core/balance.ts`.
- `src/core/battle/effects.ts`: status application/expiry/tick + combo consumption.
- `src/core/battle/ai.ts`: enemy chooses highest-expected-damage move, prefers combo consumption when available, wardens heal allies < 50%.
- `src/core/battle/taming.ts`: chance = base(1 − hp%) × difficulty × (1 + lure + skills + gear), clamp [0.05, 0.9]; failure applies enrage.
- `src/core/progression.ts`: XP curve (dino to 30, master to 20), level-ups, maturation at 10/20, move learning, skill point grants, XP share to bench.
- `src/core/sim.ts`: headless auto-battle runner.
- Thorough Vitest coverage per ARCHITECTURE §8 (this phase is where tests matter most).

## Phase 4 — Generation systems

- `src/core/gen/dino.ts`: wild dino/combatant generation for biome+tier (level from pack avg + tier offset per `balance.ts`, quirk, trait, top-4 learnset moves, appearance seed).
- `src/core/gen/alpha.ts`: 1–3 alpha mods by tier; apex bosses get fixed mod sets + stat multiplier.
- `src/core/gen/loot.ts`: rarity roll (tier-weighted), affix rolls (slot-legal, no duplicates, ilvl-scaled values), name composer, legendary powers; essence salvage values; item upgrade (rarity step-up preserving affixes, adding newly rolled ones).
- `src/core/gen/expedition.ts`: DAG per ARCHITECTURE (5 layers, 2–4 wide, all paths reach apex, node-kind quotas: ≥1 grove, ≥1 cache, ≥1 alpha, 1–2 events). Property tests: connectivity, quotas, determinism by seed.
- Reward tables: battle → loot chance + xp + essence; alpha → guaranteed rare+; apex → guaranteed epic+ & tier unlock hook.

## Phase 5 — Procedural dino art & battle UI

- `src/render/palettes.ts`: per-aspect palettes (base/shade/accent/pattern) + pattern painters (stripes, spots, plates).
- `src/render/dinoSvg.ts`: `dinoSvg(species, stage, seed, opts)` → SVG string. 8 archetype part sets (body/head/tail/limbs as layered paths), aspect decorations, stage scaling, 4px outline, cel shade, eye specular per DESIGN §8. Must look good at 96px (cards) and 220px (battle).
- `src/render/icons.ts`: aspect/role/slot/rarity glyphs.
- `src/ui/components/`: dinoCard, healthBar (with shield overlay + status chips), itemCard (rarity-colored, affix list), battleLog, commandBar.
- `src/ui/screens/battleScreen.ts`: 3v3 layout (enemy row top, player row bottom), turn indicator, move buttons w/ cooldown + aspect coloring + effectiveness hint on hover, guard/swap/tame buttons, command bar, event-driven log + simple CSS animations (lunge, shake, flash), victory/defeat/tame overlays.

## Phase 6 — Screens & game loop wire-up

- `mainMenu.ts` (3 save slots, new game w/ starter choice of 3 species, export/import), `camp.ts` (hub: pack, gear, skill tree, biome+tier expedition launcher, heal-all, essence display), `packScreen.ts` (active trio vs reserve, move slot editing, release→essence), `gearScreen.ts` (equip dino+master gear, salvage, upgrade w/ essence), `skillTree.ts` (3 branches, spend points, respec for essence), `expeditionMap.ts` (render DAG, pick next node, biome palette bg), `eventScreen.ts`, `rewardScreen.ts` (loot cards, xp, level-up + maturation fanfare, tame results), expedition summary on apex/defeat.
- Wire everything: full loop New Game → starter → camp → expedition → battles/events → apex → camp, tier unlocks, autosave after every node + at camp.

## Phase 7 — Balance, polish, deploy

- Run `sim.ts` across tiers; tune `balance.ts` (win rates: ~90% normal battles at-level, apex should feel dangerous).
- Playtest pass via `npm run dev` + Playwright smoke test (new game → win first battle) if feasible.
- `.github/workflows/deploy.yml`: push to main → test+build → deploy-pages.
- `README.md`: what the game is, how to play, dev commands, screenshot placeholder.
- Final `npm run check && npm test && npm run build` green.

## Agent orchestration notes (for the coordinating model)

- One agent per phase, sequential, each commits to `main`.
- Reviewer (coordinator) between phases: run check/test/build, skim diffs for contract drift, fix small issues directly, re-brief agent for large ones.
- Phase briefs to agents should include: read the three docs; the phase section above; ground rules; "report friction with types.ts rather than changing it".
