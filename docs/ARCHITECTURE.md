# CLAWBOUND — Technical Architecture

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | contracts keep multi-agent implementation honest |
| Build | Vite (vanilla-ts template) | zero-config, fast, static output |
| Framework | **None.** Hand-rolled screen manager + DOM rendering | no framework knowledge needed, no dependency drift, trivially debuggable |
| Creature art | Procedural layered **SVG strings** | copyright-safe, infinite variation, no asset pipeline |
| State | Single mutable `GameState` + pure core logic | see §3 |
| Persistence | `localStorage`, versioned JSON, 3 slots | offline-capable |
| Tests | Vitest, core logic only | UI is verified by playing |
| Deploy | GitHub Pages via Actions (`vite build` → `dist/`) | free static hosting |

Dependencies allowed: `vite`, `typescript`, `vitest`. **Nothing else.** No React, no state libs, no CSS frameworks.

## 2. Directory layout

```
src/
  main.ts                 # boot: load save → ScreenManager → MainMenu
  core/                   # PURE logic. No DOM, no Math.random, no Date.
    types.ts              # ★ THE CONTRACT — authored first, change only with care
    rng.ts                # seeded RNG (mulberry32) + helpers (pick, shuffle, chance, int)
    typeChart.ts          # aspect wheel multiplier
    stats.ts              # derived stats: level scaling, gear, quirks, bonds
    battle/
      engine.ts           # createBattle / legalActions / applyAction / isBattleOver
      effects.ts          # status + combo-state application/consumption
      ai.ts               # enemy action selection
      taming.ts           # tame chance formula + resolution
    gen/
      dino.ts             # wild dino generation (level, quirk, trait, moves, appearance seed)
      loot.ts             # item generation (rarity roll, affix roll, naming)
      expedition.ts       # node-map DAG generation
      alpha.ts            # alpha modifier rolls
    progression.ts        # XP curves, level-ups, maturation, packmaster skill points
    save.ts               # (de)serialize GameState ↔ localStorage, version migration
    sim.ts                # headless battle simulator (for tests + balance script)
  data/                   # content as typed constants. No logic beyond builders.
    species.ts  moves.ts  traits.ts  affixes.ts  items.ts
    skills.ts   biomes.ts events.ts  alphaMods.ts strings.ts
  render/
    dinoSvg.ts            # (appearanceSeed, species, stage) → SVG string
    palettes.ts           # aspect palettes + pattern painters
    icons.ts              # aspect/role/slot glyphs as inline SVG
  ui/
    screenManager.ts      # push/pop/replace screens; each screen owns a root <div>
    dom.ts                # el() helper, tooltip, modal, toast
    screens/
      mainMenu.ts  camp.ts  packScreen.ts  gearScreen.ts  skillTree.ts
      expeditionMap.ts  battleScreen.ts  eventScreen.ts  rewardScreen.ts
    components/
      dinoCard.ts  healthBar.ts  itemCard.ts  battleLog.ts  commandBar.ts
  styles/
    main.css              # design tokens (CSS custom properties) + all styling
index.html
```

## 3. State & purity rules (the load-bearing decisions)

1. **`src/core` is pure and deterministic.** Every function that needs randomness takes an `Rng` instance. `Math.random`, `Date.now`, and DOM access are forbidden in `core/` and `data/` (enforced by review; a grep in CI is fine).
2. **One source of truth:** a single `GameState` object (see `types.ts`). UI screens render from it and call core functions to advance it. No screen keeps game data in local fields — only view state (selected tab, hovered item).
3. **The battle engine is a reducer:** `applyAction(battle, action, rng) → BattleEvent[]` mutates the `BattleState` and returns typed events. The UI replays events to animate/log; tests assert on events and state. Enemy turns use the same reducer with `ai.chooseAction`.
4. **Content is data, not code.** Species/moves/affixes are typed constant tables in `src/data`. Effects are expressed through a closed vocabulary of typed effect descriptors (see `MoveEffect` in types) interpreted by the engine — no per-move functions. Adding content never touches engine code.
5. **Determinism enables everything:** expedition seeds reproduce maps; appearance seeds reproduce dino art; the headless simulator (`sim.ts`) can run thousands of battles for balance.

## 4. Screen flow

```
MainMenu ─ new/load ─→ Camp ─────────── start ──→ ExpeditionMap
                        │  ▲                          │      ▲
            Pack / Gear / SkillTree            node → Battle │
                                                       │  win└─(next node)
                                               Event / Reward / Taming result
                                                       │
                              Apex win / defeat ──→ Camp (expedition summary)
```

`ScreenManager` keeps a stack; screens implement `{ mount(root, ctx), unmount() }` and receive a `GameContext { state, save(), goto(screen, props) }`.

## 5. Battle engine skeleton

- `BattleState`: round counter, `Combatant[]` (both sides, derived stats snapshotted at entry, current HP, statuses with turn counters, per-move cooldowns), turn queue sorted by SPD each round, `commandUsed` flag, battle kind (wild / alpha / boss).
- A round: recompute turn order → each combatant acts (player picks `BattleAction`; enemy asks `ai.ts`) → end-of-round ticks (status damage, cooldown decrement, bond regen).
- `BattleAction` = `useMove | swap | guard | tame | command(commandId, target)`. The command does not consume the acting dino's turn; it's usable once per round at any point during a friendly turn.
- Damage: `power × (ATK/DEF) × aspectMult × bondMods × comboMods × variance(0.9–1.1)`, crit ×1.5. All tuning constants live in `core/balance.ts` — one file to tune the whole game.

## 6. Persistence

`SaveGame` (see types) is versioned; `save.ts` owns `serialize/deserialize/migrate`. Mid-expedition saves store the expedition state + seed, so refresh/resume works. Export/import = base64 of the JSON for sharing between browsers.

## 7. Deploy

GitHub Actions workflow: on push to `main` → `npm ci && npm test && npm run build` → upload `dist/` → `actions/deploy-pages`. `vite.config.ts` sets `base: '/baz/'` (repo-page path). Repo Settings → Pages → Source: **GitHub Actions** (one-time manual toggle).

## 8. Testing strategy

- Unit: type chart, damage formula, tame formula, XP curve, RNG determinism, save round-trip + migration.
- Engine: scripted battles asserting event sequences (combo consumption, bond application, command once-per-round, alpha modifiers).
- Generation: property-style tests (loot affix counts match rarity; expedition DAG always connected, apex reachable; generated dinos always have ≥1 usable move).
- Balance harness: `sim.ts` script runs N auto-battles per tier and prints win rates — run manually, not in CI.
