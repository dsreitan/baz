/**
 * Expedition map — renders the generated node DAG (ARCHITECTURE §4,
 * DESIGN §7), resolves whichever node kind the player picks, and autosaves
 * after every resolution so a mid-expedition save resumes right back here.
 *
 * Node resolution dispatch:
 *  - battle/alpha/apex -> build an encounter (`generateEncounter`) at the
 *    active pack's average level, `createBattle`, hand off to the battle
 *    screen. Its `onFinish` result is turned into save-file consequences by
 *    `core/run.ts`'s `finishBattle` (xp/loot/apex-clear/tier-unlock on
 *    victory; loot/essence clawback on defeat).
 *  - grove -> `applyGroveHeal` + an optional move-tutor modal, then back to
 *    the map.
 *  - cache -> `rewardLoot('cache', ...)` -> reward screen.
 *  - event -> the event screen resolves the `EventDef`; a `battle` outcome
 *    builds an alpha/normal encounter the same way a map battle node would.
 *
 * HP sync friction (documented, not fixed — see final report): `BattleState`
 * only exposes final HP for combatants still `combatants` at battle end
 * (i.e. never swapped out). A dino swapped to reserve mid-battle has its
 * post-swap HP tracked only inside the engine's private runtime, which
 * isn't part of the public surface. This module conservatively leaves such
 * dinos' `currentHpPercent` unchanged (their pre-battle value) rather than
 * guessing — a small player-favoring approximation flagged for a future
 * phase (expose swapped-out HP on `BattleState`, additively).
 */
import { generateEncounter, generateTamedDino } from '../../core/gen/dino';
import { rewardLoot } from '../../core/gen/loot';
import { createBattle } from '../../core/battle/engine';
import { createRng } from '../../core/rng';
import { applyGroveHeal, canFieldActivePack, computeLootFindPercent, finishBattle, unlockedCommands } from '../../core/run';
import type { BattleState, DinoInstance, ExpeditionState, GameState, MapNode, NodeKind } from '../../core/types';
import { BIOMES, EVENTS, UI } from '../../data/index';
import { availableNodes, visitNode } from '../../core/gen/expedition';
import { aspectIcon, rarityGem, roleIcon, slotIcon } from '../../render/icons';
import { el, modal, toast, type ModalHandle } from '../dom';
import { openMovesModal } from '../moveTutor';
import type { BattleFinishResult } from './battleScreen';
import { battleScreen } from './battleScreen';
import { camp } from './camp';
import { eventScreen } from './eventScreen';
import { rewardScreen } from './rewardScreen';
import type { GameContext, Screen } from '../screenManager';
import { svgIcon } from '../svgIcon';

const LAYER_SPACING_X = 170;
const ROW_SPACING_Y = 96;
const MARGIN_X = 70;
const MARGIN_Y = 60;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function getActiveDinos(state: GameState): DinoInstance[] {
  return state.activePack
    .map((uid) => state.dinos.find((d) => d.uid === uid))
    .filter((d): d is DinoInstance => d != null);
}

function getReserveDinos(state: GameState): DinoInstance[] {
  const activeSet = new Set(state.activePack);
  return state.dinos.filter((d) => !activeSet.has(d.uid));
}

function avgLevel(dinos: DinoInstance[]): number {
  if (dinos.length === 0) return 1;
  return dinos.reduce((sum, d) => sum + d.level, 0) / dinos.length;
}

function syncActiveDinoHp(state: GameState, battle: BattleState): void {
  for (const c of battle.combatants) {
    if (c.side !== 'player') continue;
    const dino = state.dinos.find((d) => d.uid === c.uid);
    if (!dino) continue;
    dino.currentHpPercent = c.fainted ? 0 : c.stats.hp > 0 ? clamp01(c.currentHp / c.stats.hp) : 0;
  }
}

function nodeIcon(node: MapNode, color: string): string {
  switch (node.kind) {
    case 'battle':
      return roleIcon('bruiser', color, 22);
    case 'alpha':
      return roleIcon('stalker', color, 22);
    case 'event':
      return aspectIcon('rune', color, 22);
    case 'grove':
      return aspectIcon('verdant', color, 22);
    case 'cache':
      return slotIcon('satchel', color, 22);
    case 'apex':
      return rarityGem('legendary', 26);
  }
}

function nodeLabel(kind: NodeKind): string {
  switch (kind) {
    case 'battle':
      return UI.nodeBattle;
    case 'alpha':
      return UI.nodeAlpha;
    case 'event':
      return UI.nodeEvent;
    case 'grove':
      return UI.nodeGrove;
    case 'cache':
      return UI.nodeCache;
    case 'apex':
      return UI.nodeApex;
  }
}

export function expeditionMap(): Screen {
  let root: HTMLElement | null = null;

  function render(ctx: GameContext): void {
    if (!root) return;
    const exp = ctx.state.expedition;
    if (!exp) {
      // Nothing to show (e.g. a stale nav after the run already ended) — bounce to Camp.
      ctx.replace(camp);
      return;
    }
    const biome = BIOMES[exp.biome];

    const layers: MapNode[][] = [];
    for (const node of exp.nodes) {
      (layers[node.layer] ??= []).push(node);
    }
    const maxRows = Math.max(...layers.map((l) => l.length));
    const width = MARGIN_X * 2 + (layers.length - 1) * LAYER_SPACING_X;
    const height = MARGIN_Y * 2 + (maxRows - 1) * ROW_SPACING_Y;

    const positions = new Map<number, { x: number; y: number }>();
    layers.forEach((layerNodes, layer) => {
      const offset = ((maxRows - layerNodes.length) * ROW_SPACING_Y) / 2;
      layerNodes.forEach((node, i) => {
        positions.set(node.id, { x: MARGIN_X + layer * LAYER_SPACING_X, y: MARGIN_Y + offset + i * ROW_SPACING_Y });
      });
    });

    const available = new Set(availableNodes(exp));

    const edgeLines = exp.nodes.flatMap((node) =>
      node.next.map((nextId) => {
        const a = positions.get(node.id)!;
        const b = positions.get(nextId)!;
        const traveled = node.visited && (exp.nodes.find((n) => n.id === nextId)?.visited || nextId === exp.at);
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${traveled ? biome?.palette.accent ?? '#fff' : 'rgba(255,255,255,0.25)'}" stroke-width="3"/>`;
      }),
    );

    const edgesSvg = el('div', { className: 'map-edges' });
    edgesSvg.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${edgeLines.join('')}</svg>`;

    const nodeEls = exp.nodes.map((node) => {
      const pos = positions.get(node.id)!;
      const isCurrent = node.id === exp.at;
      const isAvailable = available.has(node.id) && !node.visited;
      const isVisited = node.visited && !isCurrent;
      const state =
        isCurrent ? 'current' : isAvailable ? 'available' : isVisited ? 'visited' : 'locked';
      const color = biome?.palette.accent ?? '#f1e6d2';
      return el(
        'button',
        {
          className: `map-node map-node-${node.kind} map-node-${state}`,
          style: { left: `${pos.x}px`, top: `${pos.y}px` },
          disabled: !isAvailable,
          title: nodeLabel(node.kind),
          onClick: () => resolveNode(node, ctx),
        },
        svgIcon(nodeIcon(node, isAvailable || isCurrent ? color : '#8a7f6e'), 'map-node-icon'),
        el('span', { className: 'map-node-label' }, nodeLabel(node.kind)),
      );
    });

    const mapContainer = el(
      'div',
      { className: 'map-container', style: { width: `${width}px`, height: `${height}px`, background: biome?.palette.bg ?? 'transparent' } },
      edgesSvg,
      nodeEls,
    );

    const header = el(
      'div',
      { className: 'map-header' },
      el('h1', null, `${biome?.name ?? exp.biome} — Tier ${exp.tier}`),
      el(
        'div',
        { className: 'map-header-actions' },
        el('button', { className: 'btn', onClick: () => openAdjustPackModal(ctx, () => render(ctx)) }, 'Adjust Pack'),
      ),
    );

    root.replaceChildren(el('div', { className: 'map-screen' }, header, el('div', { className: 'map-scroll' }, mapContainer)));
  }

  // -------------------------------------------------------------------
  // Adjust Pack (mid-expedition swap; no Camp access mid-run)
  // -------------------------------------------------------------------

  function openAdjustPackModal(ctx: GameContext, onDone: () => void): void {
    let handle: ModalHandle | undefined;
    function content(): HTMLElement {
      const active = getActiveDinos(ctx.state);
      const reserve = getReserveDinos(ctx.state);
      const rows = [
        el('h3', null, `${UI.activePack} (${active.length}/3)`),
        ...active.map((d) =>
          el(
            'div',
            { className: 'reserve-picker-row' },
            el('div', null, `${d.nickname} — ${Math.round(d.currentHpPercent * 100)}% HP`),
            el(
              'button',
              {
                className: 'btn',
                disabled: active.length <= 1,
                onClick: () => {
                  ctx.state.activePack = ctx.state.activePack.filter((uid) => uid !== d.uid);
                  ctx.save();
                  refresh();
                },
              },
              'Bench',
            ),
          ),
        ),
        el('h3', null, `${UI.reserve} (${reserve.length})`),
        ...reserve.map((d) =>
          el(
            'div',
            { className: 'reserve-picker-row' },
            el('div', null, `${d.nickname} — ${Math.round(d.currentHpPercent * 100)}% HP`),
            el(
              'button',
              {
                className: 'btn',
                disabled: active.length >= 3,
                onClick: () => {
                  ctx.state.activePack = [...ctx.state.activePack, d.uid];
                  ctx.save();
                  refresh();
                },
              },
              'Activate',
            ),
          ),
        ),
      ];
      return el('div', { className: 'adjust-pack-modal' }, rows);
    }
    function refresh(): void {
      handle?.close();
      handle = modal({
        title: 'Adjust Pack',
        content: content(),
        actions: [{ label: UI.close, primary: true, onClick: () => { handle?.close(); onDone(); } }],
      });
    }
    refresh();
  }

  // -------------------------------------------------------------------
  // Node resolution
  // -------------------------------------------------------------------

  function resolveNode(node: MapNode, ctx: GameContext): void {
    const exp = ctx.state.expedition;
    if (!exp) return;
    if (!availableNodes(exp).includes(node.id) || node.visited) return;

    if (node.kind === 'battle' || node.kind === 'alpha' || node.kind === 'apex') {
      if (!canFieldActivePack(getActiveDinos(ctx.state))) {
        toast('Your active pack has no healthy dinos — adjust your pack first.');
        openAdjustPackModal(ctx, () => render(ctx));
        return;
      }
    }

    visitNode(exp, node.id);
    ctx.save();

    switch (node.kind) {
      case 'battle':
      case 'alpha':
      case 'apex':
        startBattleNode(node, ctx, node.kind);
        break;
      case 'grove':
        resolveGrove(node, ctx);
        break;
      case 'cache':
        resolveCache(node, ctx);
        break;
      case 'event':
        resolveEvent(node, ctx);
        break;
    }
  }

  function startBattleNode(node: MapNode, ctx: GameContext, kind: 'battle' | 'alpha' | 'apex'): void {
    const exp = ctx.state.expedition!;
    const activeDinos = getActiveDinos(ctx.state);
    const reserveDinos = getReserveDinos(ctx.state);
    const rng = createRng(exp.seed).fork(`node-${node.id}`);
    const enemies = generateEncounter({
      biome: exp.biome,
      tier: exp.tier,
      packAvgLevel: avgLevel(activeDinos),
      packSize: activeDinos.length,
      kind,
      rng,
    });
    const commands = unlockedCommands(ctx.state.packmaster.skills);
    const battle = createBattle(
      {
        kind: kind === 'battle' ? 'wild' : kind,
        playerDinos: activeDinos,
        reserve: reserveDinos,
        enemies,
        commands,
        skills: ctx.state.packmaster.skills,
        masterGear: ctx.state.packmaster.gear,
      },
      rng,
    );

    ctx.replace(battleScreen, {
      battle,
      playerDinos: activeDinos,
      reserve: reserveDinos,
      onFinish: (result: BattleFinishResult) => handleBattleFinish(node, kind, battle, result, ctx),
    });
  }

  function handleBattleFinish(node: MapNode, kind: 'battle' | 'alpha' | 'apex', battle: BattleState, result: BattleFinishResult, ctx: GameContext): void {
    const exp = ctx.state.expedition!;
    syncActiveDinoHp(ctx.state, battle);

    let tamedDino: DinoInstance | undefined;
    if (battle.tamed) {
      const combatant = battle.combatants.find((c) => c.uid === battle.tamed);
      if (combatant) tamedDino = generateTamedDino(combatant, createRng(exp.seed).fork(`tame-${node.id}`));
    }

    const outcome = result.outcome === 'fled' ? 'defeat' : result.outcome;
    const defeatedEnemyLevels = outcome === 'victory' ? battle.combatants.filter((c) => c.side === 'enemy').map((c) => c.level) : [];
    const lootFindPercent = computeLootFindPercent(ctx.state.packmaster.skills, ctx.state.packmaster.gear);
    const rng = createRng(exp.seed).fork(`reward-${node.id}`);

    const fb = finishBattle({
      outcome,
      nodeKind: kind,
      biome: exp.biome,
      tier: exp.tier,
      unlockedTier: ctx.state.unlockedTier,
      apexCleared: ctx.state.apexCleared,
      defeatedEnemyLevels,
      active: getActiveDinos(ctx.state),
      reserve: getReserveDinos(ctx.state),
      skills: ctx.state.packmaster.skills,
      lootFindPercent,
      packmaster: ctx.state.packmaster,
      lootFoundSoFar: exp.lootFound,
      essenceFoundSoFar: exp.essenceFound,
      rng,
    });

    if (outcome === 'victory') {
      ctx.state.stats.battlesWon += 1;
      const isApex = kind === 'apex';
      if (fb.apexCleared) ctx.state.apexCleared = fb.apexCleared;
      if (fb.unlockedTier) ctx.state.unlockedTier = fb.unlockedTier;
      if (isApex) ctx.state.stats.apexKills += 1;
      ctx.save();

      ctx.replace(rewardScreen, {
        title: isApex ? 'Apex Defeated!' : kind === 'alpha' ? 'Alpha Defeated!' : UI.victory,
        subtitle: isApex ? 'Expedition complete.' : undefined,
        loot: fb.loot,
        essence: fb.essence,
        xp: fb.xp,
        masterXp: fb.masterXp,
        tamedDino,
        exp,
        onContinue: () => {
          if (isApex) {
            ctx.state.stats.expeditionsCompleted += 1;
            ctx.state.expedition = undefined;
            ctx.save();
            ctx.replace(camp);
          } else {
            ctx.replace(expeditionMap);
          }
        },
      });
    } else {
      settleDefeatClawback(ctx, exp, fb.keptLoot ?? [], fb.keptEssence ?? 0);
      ctx.state.stats.expeditionsCompleted += 1;
      ctx.state.expedition = undefined;
      ctx.save();
      ctx.replace(rewardScreen, {
        title: UI.defeat,
        subtitle: `The pack retreats to camp, keeping ${fb.keptLoot?.length ?? 0} of ${exp.lootFound.length} item(s) and ${fb.keptEssence ?? 0} of ${exp.essenceFound} essence found this run.`,
        loot: [],
        essence: 0,
        tamedDino,
        onContinue: () => ctx.replace(camp),
      });
    }
  }

  /** Items/essence found this run were already added to the permanent inventory as they were picked up (reward screens enforce the inventory cap at pickup time); a defeat claws back the un-kept portion. */
  function settleDefeatClawback(ctx: GameContext, exp: ExpeditionState, keptLoot: { uid: string }[], keptEssence: number): void {
    const keptUids = new Set(keptLoot.map((i) => i.uid));
    const lostUids = new Set(exp.lootFound.filter((i) => !keptUids.has(i.uid)).map((i) => i.uid));
    if (lostUids.size > 0) ctx.state.inventory = ctx.state.inventory.filter((i) => !lostUids.has(i.uid));
    const lostEssence = Math.max(0, exp.essenceFound - keptEssence);
    ctx.state.essence = Math.max(0, ctx.state.essence - lostEssence);
  }

  function resolveGrove(_node: MapNode, ctx: GameContext): void {
    const activeDinos = getActiveDinos(ctx.state);
    const percent = applyGroveHeal(activeDinos, ctx.state.packmaster.skills);
    ctx.save();
    const handle: ModalHandle = modal({
      title: UI.nodeGrove,
      content: `The grove's warmth heals your pack for ${percent}%.`,
      actions: [
        {
          label: 'Visit the Move Tutor',
          onClick: () => {
            handle.close();
            const dinos = getActiveDinos(ctx.state);
            const pickerHandle: ModalHandle = modal({
              title: 'Move Tutor — choose a dino',
              content: el(
                'div',
                { className: 'gear-equip-list' },
                dinos.map((d) => el('button', { className: 'btn', onClick: () => { pickerHandle.close(); openMovesModal(d, ctx, () => render(ctx)); } }, d.nickname)),
              ),
              actions: [{ label: UI.close, onClick: () => pickerHandle.close() }],
            });
          },
        },
        { label: UI.confirm, primary: true, onClick: () => { handle.close(); render(ctx); } },
      ],
    });
  }

  function resolveCache(node: MapNode, ctx: GameContext): void {
    const exp = ctx.state.expedition!;
    const activeDinos = getActiveDinos(ctx.state);
    const lootFindPercent = computeLootFindPercent(ctx.state.packmaster.skills, ctx.state.packmaster.gear);
    const rng = createRng(exp.seed).fork(`node-${node.id}`);
    const { items, essence } = rewardLoot({ nodeKind: 'cache', tier: exp.tier, enemyLevel: Math.round(avgLevel(activeDinos)), lootFindPercent, rng });
    ctx.replace(rewardScreen, {
      title: 'Cache Found!',
      loot: items,
      essence,
      exp,
      onContinue: () => ctx.replace(expeditionMap),
    });
  }

  function resolveEvent(node: MapNode, ctx: GameContext): void {
    const exp = ctx.state.expedition!;
    const eventDef = node.eventId ? EVENTS[node.eventId] : undefined;
    if (!eventDef) {
      ctx.replace(expeditionMap);
      return;
    }
    const activeDinos = getActiveDinos(ctx.state);
    const reserveDinos = getReserveDinos(ctx.state);
    const rng = createRng(exp.seed).fork(`node-${node.id}`);

    ctx.replace(eventScreen, {
      event: eventDef,
      rng,
      active: activeDinos,
      reserve: reserveDinos,
      skills: ctx.state.packmaster.skills,
      tier: exp.tier,
      itemLevel: Math.round(avgLevel(activeDinos)),
      exp,
      onFinish: (result) => {
        ctx.save();
        if (result.triggersBattle) {
          startBattleNode(node, ctx, result.triggersBattle.alpha ? 'alpha' : 'battle');
        } else {
          ctx.replace(expeditionMap);
        }
      },
    });
  }

  return {
    mount(mountRoot: HTMLElement, ctx: GameContext): void {
      root = mountRoot;
      render(ctx);
    },
    unmount(): void {
      if (root) root.innerHTML = '';
      root = null;
    },
  };
}
