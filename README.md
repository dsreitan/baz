# Clawbound

**Tame the wilds. Bind the pack. Hunt the apex.**

A browser-based, turn-based creature-taming game about building a pack of
three dinosaurs whose types, roles, and abilities interlock, then leading
them on procedurally generated expeditions into ever-more-dangerous wilds.

## What it is

You are a **Packmaster** on the untamed continent of Sauria. Every run starts
at your persistent **Camp** and heads out on a short, procedurally generated
**expedition**: a branching node map of battles, elite "Alpha" encounters,
risk/reward events, healing groves, loot caches, and an **Apex Boss** at the
end. Weaken a wild dino below 35% HP and you can tame it into your reserve;
your dinos and your Packmaster both level up, gear drops with random
affixes, and four **World Tiers** raise the stakes (and the loot) without
ever letting you out-level the game into boredom. There is no fixed
overworld and no "collect them all" — every expedition is a different map,
different encounters, different biome, different build.

The creature-and-battle layer draws on Pokémon-style turn-based combat with
a twist: fights are 3-versus-3, not 1-versus-1. Eight **Primal Aspects**
(Ember, Frost, Verdant, Stone, Storm, Tide, Venom, Rune) sit on a type wheel
where each aspect is strong against the next two clockwise and weak against
the previous two — easy to learn, no lookup table required. Five **Roles**
(Bruiser, Guardian, Stalker, Warden, Screecher) shape a species' stats and
move kit. Stack two dinos of the same Aspect or Role in your active trio and
you get a **Pack Bond**; chain status effects like *Soak*, *Chill*, and
*Knockdown* into the moves that consume them for bonus damage, guaranteed
crits, or DEF-piercing hits, and you've found the mastery curve. Gear
(Diablo/WoW-style rarities and affixes, six equipment slots across your pack
and your Packmaster) and Alpha modifiers on elite wilds add the long-tail
loot chase.

## How to play

**The core loop:** Camp → choose a biome + World Tier → walk the expedition's
node map → return to Camp with XP, loot, essence, new tames, and (on an Apex
kill) a shot at the next World Tier.

- **Taming.** Any wild dino below 35% HP becomes tame-able. Spend a turn on
  Tame (or the Packmaster's *Throw Lure* command to improve the odds).
  Failed attempts enrage the target, so time it. Alphas keep one of their
  modifiers permanently if you tame them.
- **Pack Bonds & combos.** Build your active trio around a shared Aspect
  (+damage), a shared Role (a role-specific team perk), or three different
  Roles (a small all-stats bonus). Watch for combo-applier moves (they tag a
  target with Soak/Chill/Knockdown/Charged) and follow up with the matching
  combo-consumer move on the same or another dino.
- **Gear.** Each dino has three slots (Plating/Talon/Charm); your Packmaster
  has three more (Whistle/Satchel/Standard). Higher rarities carry more
  affixes; salvage or release for **Essence**, which upgrades a favorite
  item's rarity a step, or respecs your Packmaster's skill tree.
- **World Tiers.** Enemy level and toughness scale off your active pack's
  average level, offset by the World Tier you chose. Beating a biome's Apex
  Boss on your current tier unlocks the next tier — permanent progress, no
  reset, the game's "New Game+."
- **Defeat is soft.** If your whole pack falls, the expedition ends but you
  keep your XP and roughly half the loot/essence found so far.

## Controls

Mouse/touch only — there's no keyboard scheme to learn. Click a move to use
it (it resolves immediately if it only has one legal target, otherwise click
a highlighted target on the field). Guard, Swap, Tame, and your one Command
per round are buttons in the action bar. `Esc` closes the current dialog.

## Development

Requirements: Node 18+.

```bash
npm install
npm run dev      # local dev server (Vite)
npm test         # vitest, full suite
npm run check    # tsc --noEmit, strict mode
npm run build    # production build to dist/
```

The whole game is `vite` + `typescript` + `vitest` — no other runtime
dependencies. `src/core` and `src/data` are pure (no DOM, no `Math.random`,
no `Date`; all randomness flows through a seeded, forkable `Rng`), which is
what makes both the automated balance tuning below and full-run determinism
(see `?seed=` in `src/ui/devSeed.ts`) possible.

## Balance & simulation notes

Every tuning constant (damage scale, HP/level curves, tier multipliers, taming
odds, XP curves, ...) lives in one file: `src/core/balance.ts`. It's read by
the battle engine, stats, taming, and generation modules — nothing else in
the game hardcodes a magic number for feel.

`src/core/sim.ts` is a headless auto-battle runner (both sides driven by the
same AI heuristic as wild enemies) used to sanity-check tuning without
touching the UI. `src/core/balance-report.test.ts` drives it across the
level/tier curve — starter vs. first wild, a representative trio at each
World Tier's normal battles, and at-level Apex fights — averaged over every
biome and several independently-rolled enemy rosters per biome, so the
numbers reflect overall tuning rather than a single lucky (or unlucky)
type-wheel matchup. It runs as part of `npm test` at a small sample size;
set `RUN_BALANCE_REPORT=1` and add `--reporter=verbose` for a full report
while iterating:

```bash
RUN_BALANCE_REPORT=1 npx vitest run src/core/balance-report.test.ts --reporter=verbose
```

Current targets (and where the tuning lands): ordinary battles win ~90-100%
of the time at level parity in 4-9 rounds of real HP attrition (not a
coin-flip alpha strike); Apex bosses are a genuine fight, winning roughly
40-60% of the time and taking meaningfully longer.

There's also a full end-to-end smoke test — `scripts/smoke.mjs` — that
builds the game, serves it, and drives a real browser through new game →
starter pick → camp → expedition → winning the first battle → reward screen
→ back to the map, asserting no page errors. It needs `playwright`
available at run time (deliberately not a project dependency — see the
script's header comment for how to run it without adding one to
`package.json`).

## Project docs

- [`docs/DESIGN.md`](docs/DESIGN.md) — the game design document (pitch,
  systems, content scope, balance targets).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — module layout and data
  flow.
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — the
  phase-by-phase build log this codebase was implemented against.

## Art

**100% procedural.** Every dinosaur, icon, and UI ornament is layered SVG
generated from a per-individual seed at runtime (`src/render/`) — there are
no external image, font, or audio assets anywhere in this repo.

## Deployment

Pushing to `main` runs typecheck + tests + build and deploys `dist/` to
GitHub Pages via `.github/workflows/deploy.yml` (needs Pages enabled on the
repo, source set to "GitHub Actions").

## License

MIT — see [`LICENSE`](LICENSE).
