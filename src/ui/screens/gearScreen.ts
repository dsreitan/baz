/**
 * Gear screen — inventory grid, equip/unequip (dino + Packmaster slots),
 * salvage (single + bulk common/uncommon), and rarity-step upgrades
 * (DESIGN §5, ARCHITECTURE gen/loot.ts).
 */
import { salvageEssence, upgradeCost, upgradeItem } from '../../core/gen/loot';
import { createRng } from '../../core/rng';
import { applyEssenceYieldBonus, applyLootToInventory } from '../../core/run';
import type { DinoGearSlot, DinoInstance, GameState, ItemInstance, MasterGearSlot, Rarity, Uid } from '../../core/types';
import { UI } from '../../data/index';
import { itemCard } from '../components/itemCard';
import { el, modal, toast, type ModalHandle } from '../dom';
import type { GameContext, Screen } from '../screenManager';
import { camp } from './camp';

const DINO_SLOTS: DinoGearSlot[] = ['plating', 'talon', 'charm'];
const MASTER_SLOTS: MasterGearSlot[] = ['whistle', 'satchel', 'standard'];
const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const SLOT_ORDER = [...DINO_SLOTS, ...MASTER_SLOTS];

type ItemLocation =
  | { kind: 'inventory'; index: number }
  | { kind: 'dino'; dino: DinoInstance; slot: DinoGearSlot }
  | { kind: 'master'; slot: MasterGearSlot };

function findItemLocation(state: GameState, uid: Uid): { item: ItemInstance; location: ItemLocation } | undefined {
  const invIdx = state.inventory.findIndex((i) => i.uid === uid);
  if (invIdx !== -1) return { item: state.inventory[invIdx]!, location: { kind: 'inventory', index: invIdx } };
  for (const dino of state.dinos) {
    for (const slot of DINO_SLOTS) {
      const item = dino.gear[slot];
      if (item?.uid === uid) return { item, location: { kind: 'dino', dino, slot } };
    }
  }
  for (const slot of MASTER_SLOTS) {
    const item = state.packmaster.gear[slot];
    if (item?.uid === uid) return { item, location: { kind: 'master', slot } };
  }
  return undefined;
}

function removeItem(state: GameState, location: ItemLocation): void {
  if (location.kind === 'inventory') state.inventory.splice(location.index, 1);
  else if (location.kind === 'dino') delete location.dino.gear[location.slot];
  else delete state.packmaster.gear[location.slot];
}

function placeItem(state: GameState, location: ItemLocation, item: ItemInstance): void {
  if (location.kind === 'inventory') state.inventory[location.index] = item;
  else if (location.kind === 'dino') location.dino.gear[location.slot] = item;
  else state.packmaster.gear[location.slot] = item;
}

export function gearScreen(): Screen {
  let root: HTMLElement | null = null;

  function openEquipModal(item: ItemInstance, ctx: GameContext, rerender: () => void): void {
    const state = ctx.state;
    const isMaster = (MASTER_SLOTS as string[]).includes(item.slot);
    let handle: ModalHandle | undefined;

    function equipTo(target: { kind: 'dino'; dino: DinoInstance } | { kind: 'master' }): void {
      const found = findItemLocation(state, item.uid);
      if (!found || found.location.kind !== 'inventory') return;
      removeItem(state, found.location);
      if (target.kind === 'master') {
        const slot = item.slot as MasterGearSlot;
        const previous = state.packmaster.gear[slot];
        state.packmaster.gear[slot] = item;
        if (previous) state.inventory.push(previous);
      } else {
        const slot = item.slot as DinoGearSlot;
        const previous = target.dino.gear[slot];
        target.dino.gear[slot] = item;
        if (previous) state.inventory.push(previous);
      }
      ctx.save();
      handle?.close();
      rerender();
    }

    const rows = isMaster
      ? [el('button', { className: 'btn btn-primary', onClick: () => equipTo({ kind: 'master' }) }, `Equip to ${state.packmaster.name}`)]
      : state.dinos.map((dino) =>
          el(
            'button',
            { className: 'btn', onClick: () => equipTo({ kind: 'dino', dino }) },
            `${dino.nickname} (Lv.${dino.level})${dino.gear[item.slot as DinoGearSlot] ? ' — replaces equipped' : ''}`,
          ),
        );

    handle = modal({
      title: `Equip ${item.name}`,
      content: el('div', { className: 'gear-equip-list' }, rows),
      actions: [{ label: UI.cancel, onClick: () => handle?.close() }],
    });
  }

  function confirmSalvage(item: ItemInstance, ctx: GameContext, rerender: () => void): void {
    const gain = applyEssenceYieldBonus(salvageEssence(item), ctx.state.packmaster.skills);
    const handle: ModalHandle = modal({
      title: `Salvage ${item.name}?`,
      content: `This destroys the item for ${gain} essence.`,
      actions: [
        { label: UI.cancel, onClick: () => handle.close() },
        {
          label: UI.salvage,
          primary: true,
          onClick: () => {
            const found = findItemLocation(ctx.state, item.uid);
            if (found) removeItem(ctx.state, found.location);
            ctx.state.essence += gain;
            ctx.save();
            toast(`Salvaged for +${gain} essence.`);
            handle.close();
            rerender();
          },
        },
      ],
    });
  }

  function doUpgrade(item: ItemInstance, ctx: GameContext, rerender: () => void): void {
    const cost = upgradeCost(item);
    if (ctx.state.essence < cost) {
      toast(`Not enough essence (need ${cost}).`);
      return;
    }
    const found = findItemLocation(ctx.state, item.uid);
    if (!found) return;
    const rng = createRng(ctx.state.seed).fork(`upgrade-${item.uid}-${ctx.state.essence}`);
    const upgraded = upgradeItem(item, rng);
    placeItem(ctx.state, found.location, upgraded);
    ctx.state.essence -= cost;
    ctx.save();
    toast(`${item.name} upgraded to ${upgraded.rarity}!`);
    rerender();
  }

  function confirmSalvageAll(ctx: GameContext, rerender: () => void): void {
    const targets = ctx.state.inventory.filter((i) => i.rarity === 'common' || i.rarity === 'uncommon');
    if (targets.length === 0) {
      toast('Nothing common/uncommon to salvage.');
      return;
    }
    const totalGain = targets.reduce((sum, i) => sum + applyEssenceYieldBonus(salvageEssence(i), ctx.state.packmaster.skills), 0);
    const handle: ModalHandle = modal({
      title: `Salvage ${targets.length} items?`,
      content: `Destroys every common/uncommon item in your inventory for a total of ${totalGain} essence.`,
      actions: [
        { label: UI.cancel, onClick: () => handle.close() },
        {
          label: UI.salvage,
          primary: true,
          onClick: () => {
            const targetUids = new Set(targets.map((i) => i.uid));
            ctx.state.inventory = ctx.state.inventory.filter((i) => !targetUids.has(i.uid));
            ctx.state.essence += totalGain;
            ctx.save();
            toast(`Salvaged ${targets.length} items for +${totalGain} essence.`);
            handle.close();
            rerender();
          },
        },
      ],
    });
  }

  function unequip(item: ItemInstance, ctx: GameContext, rerender: () => void): void {
    const result = applyLootToInventory(ctx.state.inventory, [item]);
    if (result.overflow.length > 0) {
      toast('Inventory is full — salvage something first.');
      return;
    }
    const found = findItemLocation(ctx.state, item.uid);
    if (found && found.location.kind !== 'inventory') removeItem(ctx.state, found.location);
    ctx.state.inventory = result.inventory;
    ctx.save();
    rerender();
  }

  function equippedSlotBox(label: string, item: ItemInstance | undefined, ctx: GameContext, rerender: () => void): HTMLElement {
    if (!item) return el('div', { className: 'gear-slot-box gear-slot-empty' }, el('div', { className: 'gear-slot-label' }, label), 'Empty');
    return el(
      'div',
      { className: 'gear-slot-box' },
      el('div', { className: 'gear-slot-label' }, label),
      itemCard(item).root,
      el(
        'div',
        { className: 'gear-slot-actions' },
        el('button', { className: 'btn', onClick: () => unequip(item, ctx, rerender) }, UI.unequip),
        el('button', { className: 'btn', onClick: () => doUpgrade(item, ctx, rerender) }, `${UI.upgrade} (${upgradeCost(item)})`),
      ),
    );
  }

  function render(ctx: GameContext): void {
    if (!root) return;
    const state = ctx.state;
    const rerender = () => render(ctx);

    const masterPanel = el(
      'div',
      { className: 'panel gear-panel' },
      el('h2', { className: 'camp-panel-title' }, `${state.packmaster.name}'s Gear`),
      el('div', { className: 'gear-slot-row' }, MASTER_SLOTS.map((slot) => equippedSlotBox(slot, state.packmaster.gear[slot], ctx, rerender))),
    );

    const dinoPanels = state.dinos.map((dino) =>
      el(
        'div',
        { className: 'panel gear-panel' },
        el('h2', { className: 'camp-panel-title' }, `${dino.nickname} (Lv.${dino.level})`),
        el('div', { className: 'gear-slot-row' }, DINO_SLOTS.map((slot) => equippedSlotBox(slot, dino.gear[slot], ctx, rerender))),
      ),
    );

    const sortedInventory = [...state.inventory].sort((a, b) => {
      const slotDiff = SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot);
      if (slotDiff !== 0) return slotDiff;
      return RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
    });

    const inventoryGrid = el(
      'div',
      { className: 'gear-inventory-grid' },
      sortedInventory.map((item) =>
        el(
          'div',
          { className: 'gear-inventory-cell' },
          itemCard(item).root,
          el(
            'div',
            { className: 'gear-slot-actions' },
            el('button', { className: 'btn', onClick: () => openEquipModal(item, ctx, rerender) }, UI.equip),
            el('button', { className: 'btn', onClick: () => doUpgrade(item, ctx, rerender) }, `${UI.upgrade} (${upgradeCost(item)})`),
            el('button', { className: 'btn', onClick: () => confirmSalvage(item, ctx, rerender) }, UI.salvage),
          ),
        ),
      ),
    );

    root.replaceChildren(
      el(
        'div',
        { className: 'gear-screen' },
        el('div', { className: 'pack-screen-header' }, el('h1', null, UI.gear), el('button', { className: 'btn', onClick: () => ctx.replace(camp) }, UI.back)),
        masterPanel,
        dinoPanels,
        el(
          'div',
          { className: 'gear-inventory-header' },
          el('h2', { className: 'camp-panel-title' }, `${UI.inventory} (${state.inventory.length}/60)`),
          el('button', { className: 'btn', onClick: () => confirmSalvageAll(ctx, rerender) }, 'Salvage all commons/uncommons'),
        ),
        inventoryGrid,
      ),
    );
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
