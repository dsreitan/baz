# CLAWBOUND — Game Design Document

> Working title: **Clawbound**. Alternatives considered: *Primal Pact*, *Sauria: Packmaster*, *Thornscale Wilds*. Rename is a find-and-replace in `src/data/strings.ts`.

## 1. Pitch

You are a **Packmaster** on the untamed continent of **Sauria**. You tame wild dinosaurs, forge them into a pack of three whose types, roles, and abilities interlock, and lead them on procedurally generated expeditions into ever-more-dangerous wilds. Dinos and Packmaster both level up; gear drops with random affixes; enemies scale with you across World Tiers. Turn-based, session-friendly, endlessly replayable, playable in any browser.

Design DNA (inspiration, not imitation):
- **Pokémon (Gen 1)** → taming creatures, turn-based battles, team-building with complementary types. *No capture balls, no "gotta catch 'em all" collection framing, completely different creature designs, types, and battle structure (3v3, not 1v1).*
- **World of Warcraft / Dragon Age** → gear with rarity tiers and affixes, equipment slots per creature and for the player character.
- **Diablo 4** → enemy scaling, World Tiers, elite ("Alpha") monsters with random modifiers, loot as the engine of replayability.
- **Warcraft 3** → visual tone: chunky, cartoony, saturated, thick outlines, exaggerated silhouettes.

## 2. Anti-linearity principles

The whole structure is built to avoid a "play once, done" campaign:

1. **No fixed overworld.** Play is organized as **expeditions**: short (15–30 min) procedurally generated node-map runs into a chosen biome, launched from a persistent home **Camp**. Every run is a different map, different encounters, different loot.
2. **Enemies scale.** Enemy level = your average active-pack level, offset by World Tier. You can never out-level the game into boredom.
3. **World Tiers I–IV.** Each tier raises enemy offsets, Alpha density, and loot quality (higher rarity weights, more affixes). Beating a biome's **Apex Boss** on a tier unlocks the next. Tiers are the New-Game+ that never resets your progress.
4. **Random Alphas.** Elite wild dinos spawn with 1–3 random modifiers (e.g. *Stoneskin*, *Frenzied*, *Venomous*, *Pack Leader*) — the Diablo elite formula. Defeated Alphas are the best taming targets: they keep one modifier as a permanent trait.
5. **Loot is generated, not placed.** Items roll rarity + affixes from pools. Chasing a better *Talon of the Storm Tyrant* is the long-tail motivation.

## 3. Core fantasy loop

```
CAMP ──> choose biome + world tier ──> EXPEDITION (node map, ~12 nodes)
 ▲          battles · alphas · events · caches · groves · APEX BOSS
 │                                                        │
 └── XP · loot · new tames · essence · tier unlocks ──────┘
```

Defeat is soft: if the whole pack falls, the expedition ends and you keep XP and half the loot found so far (roguelite-light — losing still teaches, never erases).

## 4. Dinosaurs

### 4.1 Types (8) — the "Primal Aspects"

Aspects sit on a wheel; each is **strong (×1.5) against the next two clockwise** and **weak (×0.67) against the previous two**. Trivial to implement, easy to learn, no lookup-table sprawl.

Wheel order: **Ember → Frost → Verdant → Stone → Storm → Tide → Venom → Rune → (Ember)**

| Aspect | Flavor | Palette anchor |
|---|---|---|
| Ember | volcanic, fire | orange/red |
| Frost | glacial, ice | pale blue/white |
| Verdant | jungle, plant | green |
| Stone | mountain, earth | brown/grey |
| Storm | sky, lightning | yellow/violet |
| Tide | coast, water | blue/teal |
| Venom | swamp, toxin | purple/sickly green |
| Rune | ancient, arcane | magenta/gold glyphs |

### 4.2 Roles (5) — the synergy layer

Every species has a role. Roles define stat spreads and move kits:

| Role | Identity | Stat bias |
|---|---|---|
| **Bruiser** | raw damage | ATK↑↑ |
| **Guardian** | tank, taunts, shields | HP↑ DEF↑↑ |
| **Stalker** | fast, crits, executes | SPD↑↑ crit |
| **Warden** | heals, buffs allies | balanced, support kit |
| **Screecher** | debuffs, status spread | SPD↑, debuff kit |

### 4.3 Synergy mechanics (two layers)

1. **Pack Bonds** (passive, evaluated on the active trio at battle start):
   - 2+ dinos share an Aspect → **Aspect Bond**: +15% damage with that aspect's moves.
   - 2+ dinos share a Role → **Role Bond**: role-specific perk (2 Guardians → team takes −10% damage; 2 Stalkers → +10% crit chance; etc.).
   - All 3 different Roles → **Balanced Pack**: +5% all stats.
2. **Combo states** (active, skill-expressed): moves apply tagged statuses that other moves *consume* for bonus effect. Examples: *Soak* (consumed by Storm moves: +50% power), *Chill* (consumed by strike moves: guaranteed crit), *Knockdown* (consumed by Stalker moves: ignores DEF). Building a pack that chains combos is the mastery curve.

### 4.4 Growth

- Levels 1–30. Stats grow per-species. Moves learned from a per-species learnset (4 active slots, swap freely at Camp).
- **Maturation** at levels 10 and 20: Juvenile → Adult → **Alpha stage** (stat bump + visual upgrade: bigger horns/plates/frills). No species transformation — your raptor stays your raptor, it just becomes magnificent.
- Each individual rolls a small random stat **Quirk** (+5–10% to one stat) and one **Trait** from its species pool — two wild-caught dinos of the same species are never identical.

### 4.5 Taming

No capture devices. Weaken a wild dino below **35% HP**, then any dino's turn can be spent on a **Tame** attempt (or the Packmaster command *Throw Lure* improves odds). Chance scales with missing HP, active statuses (sleep/chill help), lure quality, and the Packmaster's Handler skills. Failed attempts enrage the target (+ATK). Tamed dinos join the reserve at their wild level.

### 4.6 Species roster (launch: 18)

Archetypes (drives procedural appearance): raptor, theropod, sauropod, ceratopsian, stegosaur, ankylosaur, pterosaur, spinosaur. Roster covers all 8 aspects × 5 roles with deliberate gaps (not a full matrix — gaps make team-building interesting). Full stat table lives in `src/data/species.ts`.

## 5. Gear (the WoW/Diablo layer)

- **Dino slots (3):** *Plating* (defense), *Talon* (offense), *Charm* (utility/aspect effects).
- **Packmaster slots (3):** *Whistle* (command power), *Satchel* (expedition utility, lure quality), *Standard* (pack-wide aura).
- **Rarities:** Common (0 affixes) → Uncommon (1) → Rare (2) → Epic (3) → Legendary (3 + unique power).
- **Affixes** roll from slot-appropriate pools: flat/percent stats, on-hit status chances, aspect damage, combo-state bonuses, tame chance, loot find.
- **Essence** (from duplicate/released dinos and salvaged gear) upgrades an item's rarity one step, rerolling nothing — your favorite item can grow with you.

## 6. The Packmaster (the "you" layer)

Kept deliberately light so it never confuses the creature game — the Packmaster **never takes a combat turn as a unit** and **cannot be targeted**. Instead:

- **One Command per battle round**, chosen from unlocked commands: *Rally* (+20% ATK this round), *Field Dressing* (heal one dino 25%), *Throw Lure* (tame setup), *Recall/Deploy* (free swap), *Focus* (reset one cooldown).
- **XP and levels** (earned alongside the pack) grant **skill points** in three branches, ~6 nodes each:
  - **Tactician** — unlock/upgrade Commands (this is where decision depth lives).
  - **Handler** — tame chance, reserve size, XP share to benched dinos.
  - **Survivalist** — expedition perks: extra node reveals, better caches, keep more loot on defeat, essence yield.
- Respec at Camp for essence. If playtesting shows this layer is noise, the drop-plan is: commands become items. But the "one command per round" constraint has a high fun-to-complexity ratio — one meaningful decision, zero extra turns.

## 7. Expeditions

- Choose **biome** (each biases which aspects/species/affixes appear: Cinder Peaks, Frostfen, Verdant Maw, Stormreach Cliffs, Sunken Coast, Miregloom) and **World Tier**.
- Generated DAG map: 5 layers, 2–4 nodes per layer, branching paths, all leading to the **Apex** node.
- Node kinds: **Battle** (wild pack), **Alpha** (elite, best tame/loot), **Event** (choice vignette: risk/reward), **Grove** (heal + optional move-tutor), **Cache** (loot), **Apex** (boss).
- Between nodes: no free healing (Groves and Warden kits matter); pack state persists across the run.

## 8. Art direction — "Warcraft 3 Saturday-morning"

**Zero external assets.** All art is procedurally drawn (layered SVG) under one style contract:

- Chunky proportions: heads and feet oversized ~1.4×, short thick limbs.
- **4px dark outline** (#2a1a33-ish, not pure black), 2-tone cel shading (base + darker belly/shadow), single white specular dot in eyes.
- Saturated palettes keyed to Aspect; per-individual pattern variation (stripes/spots/plates) from the creature's seed.
- Dinos assembled from parts per archetype: body, head, tail, limbs + aspect decorations (Ember: glowing cracks; Frost: icicle plates; Rune: floating glyphs...). Maturation stage scales decorations.
- UI: warm parchment-and-carved-stone panels, chunky rounded buttons, big readable numbers. Fonts: system rounded stack (no webfont dependency).

## 9. Scope guardrails (v1)

- Single-player, browser, offline-capable. Save = localStorage (3 slots + export/import as JSON string).
- No audio in v1 (stub the hook points).
- No animations beyond CSS transitions + simple attack lunges/shakes.
- 18 species, ~48 moves, ~40 affixes, 6 biomes, 4 world tiers, 1 boss species per biome.
- Balance targets: first expedition ~20 min; first Apex kill ~3–4 expeditions; Tier IV Apex ~15–20 hours.
