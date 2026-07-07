/**
 * Reward screen — shown after battles, caches, and apex kills (DESIGN §3/§7,
 * ARCHITECTURE §4). Applies essence/loot to the save on mount (inventory-cap
 * overflow gets a salvage prompt), shows level-up/maturation/new-move
 * fanfare from a `GrantXpResult`, a tame-result panel (nickname + join
 * reserve or a "no room" prompt), and a packmaster level-up notice.
 */
import { salvageEssence } from '../../core/gen/loot';
import type { GrantXpResult, MasterXpResult } from '../../core/progression';
import { applyLootToInventory, reserveSize } from '../../core/run';
import type { DinoInstance, ExpeditionState, ItemInstance } from '../../core/types';
import { SPECIES, UI } from '../../data/index';
import { itemCard } from '../components/itemCard';
import { el, modal, toast, type ModalHandle } from '../dom';
import type { GameContext, Screen } from '../screenManager';

export interface RewardScreenProps {
  title: string;
  subtitle?: string;
  loot: ItemInstance[];
  essence: number;
  xp?: GrantXpResult;
  masterXp?: MasterXpResult;
  /** A freshly generated tamed dino, not yet added to `state.dinos`. */
  tamedDino?: DinoInstance;
  /** When resolving a node mid-expedition, mirrors this reward into the run's running loot/essence tally (ARCHITECTURE §6 — used to compute the defeat-loot-keep clawback). Omit for non-expedition rewards. */
  exp?: ExpeditionState;
  onContinue: () => void;
}

export function rewardScreen(props: RewardScreenProps): Screen {
  let root: HTMLElement | null = null;
  let tameResolved = !props.tamedDino;
  let tameJoinedName: string | null = null;

  function applyRewardsOnce(ctx: GameContext): { overflow: ItemInstance[] } {
    ctx.state.essence += props.essence;
    const result = applyLootToInventory(ctx.state.inventory, props.loot);
    ctx.state.inventory = result.inventory;
    if (props.exp) {
      props.exp.lootFound.push(...props.loot);
      props.exp.essenceFound += props.essence;
    }
    ctx.save();
    return { overflow: result.overflow };
  }

  function promptOverflowSalvage(ctx: GameContext, overflow: ItemInstance[], rerender: () => void): void {
    if (overflow.length === 0) return;
    const totalEssence = overflow.reduce((sum, i) => sum + salvageEssence(i), 0);
    const handle: ModalHandle = modal({
      title: 'Inventory full',
      content: `${overflow.length} item${overflow.length === 1 ? '' : 's'} didn't fit (inventory cap 60). Salvage them now for ${totalEssence} essence, or they'll be lost?`,
      actions: [
        {
          label: 'Lose them',
          onClick: () => handle.close(),
        },
        {
          label: 'Salvage for essence',
          primary: true,
          onClick: () => {
            ctx.state.essence += totalEssence;
            ctx.save();
            toast(`Salvaged ${overflow.length} overflow items for +${totalEssence} essence.`);
            handle.close();
            rerender();
          },
        },
      ],
    });
  }

  function joinReserve(ctx: GameContext, dino: DinoInstance, nickname: string): void {
    dino.nickname = nickname.trim().length > 0 ? nickname.trim() : dino.nickname;
    ctx.state.dinos.push(dino);
    ctx.state.stats.dinosTamed += 1;
    props.exp?.tamedThisRun.push(dino.uid);
    ctx.save();
  }

  function renderTamePanel(ctx: GameContext, rerender: () => void): HTMLElement | null {
    const tamed = props.tamedDino;
    if (!tamed) return null;
    const species = SPECIES[tamed.species];
    const cap = reserveSize(ctx.state.packmaster.skills);
    const currentReserve = ctx.state.dinos.length - ctx.state.activePack.length;
    const hasRoom = currentReserve < cap;

    if (tameResolved) {
      return el('div', { className: 'panel reward-tame-panel' }, `${tameJoinedName ?? tamed.nickname} joined the pack!`);
    }

    if (hasRoom) {
      const input = el('input', { className: 'menu-name-input', type: 'text', value: species?.name ?? tamed.nickname, maxlength: 20 }) as HTMLInputElement;
      return el(
        'div',
        { className: 'panel reward-tame-panel' },
        el('h3', null, `A wild ${species?.name ?? tamed.species} was tamed!`),
        el('label', null, 'Nickname', input),
        el(
          'button',
          {
            className: 'btn btn-primary',
            onClick: () => {
              joinReserve(ctx, tamed, input.value);
              tameResolved = true;
              tameJoinedName = tamed.nickname;
              rerender();
            },
          },
          'Confirm',
        ),
      );
    }

    // No reserve room: let the player free a slot or release the new tame.
    return el(
      'div',
      { className: 'panel reward-tame-panel' },
      el('h3', null, `A wild ${species?.name ?? tamed.species} was tamed, but the reserve is full!`),
      el(
        'div',
        { className: 'reward-tame-choices' },
        el(
          'button',
          {
            className: 'btn',
            onClick: () => {
              const handle: ModalHandle = modal({
                title: 'Choose a reserve dino to release',
                content: el(
                  'div',
                  { className: 'gear-equip-list' },
                  ctx.state.dinos
                    .filter((d) => !ctx.state.activePack.includes(d.uid))
                    .map((d) =>
                      el(
                        'button',
                        {
                          className: 'btn',
                          onClick: () => {
                            ctx.state.dinos = ctx.state.dinos.filter((x) => x.uid !== d.uid);
                            joinReserve(ctx, tamed, species?.name ?? tamed.nickname);
                            tameResolved = true;
                            tameJoinedName = tamed.nickname;
                            handle.close();
                            rerender();
                          },
                        },
                        `Release ${d.nickname} (Lv.${d.level})`,
                      ),
                    ),
                ),
                actions: [{ label: UI.cancel, onClick: () => handle.close() }],
              });
            },
          },
          'Free a reserve slot',
        ),
        el(
          'button',
          {
            className: 'btn',
            onClick: () => {
              tameResolved = true;
              tameJoinedName = null;
              rerender();
            },
          },
          'Let it go',
        ),
      ),
    );
  }

  function renderXpPanel(ctx: GameContext): HTMLElement | null {
    const xp = props.xp;
    if (!xp) return null;
    const rows = Object.entries(xp.xpAwarded).map(([uid, amount]) => {
      const dino = ctx.state.dinos.find((d) => d.uid === uid);
      const levelUp = xp.levelUps.filter((l) => l.uid === uid);
      const maturation = xp.maturations.find((m) => m.uid === uid);
      const learnable = xp.newlyLearnable[uid];
      return el(
        'div',
        { className: 'reward-xp-row' },
        el('span', { className: 'reward-xp-name' }, dino?.nickname ?? uid),
        el('span', null, `+${amount} XP`),
        levelUp.length > 0 ? el('span', { className: 'reward-xp-levelup' }, `Level up! Lv.${levelUp[levelUp.length - 1]!.toLevel}`) : null,
        maturation ? el('span', { className: 'reward-maturation' }, `Grew into ${maturation.stage === 'alpha' ? 'Alpha' : 'Adult'} stage!`) : null,
        learnable && learnable.length > 0 ? el('span', { className: 'reward-new-move' }, `Can learn: ${learnable.join(', ')} (visit Pack)`) : null,
      );
    });
    return el('div', { className: 'panel reward-xp-panel' }, el('h3', null, UI.xpEarned), rows);
  }

  function render(ctx: GameContext): void {
    if (!root) return;
    const rerender = () => render(ctx);

    const lootGrid = el(
      'div',
      { className: 'reward-loot-grid' },
      props.loot.map((item) => itemCard(item).root),
    );

    root.replaceChildren(
      el(
        'div',
        { className: 'reward-screen panel' },
        el('h1', { className: 'reward-title' }, props.title),
        props.subtitle ? el('p', { className: 'reward-subtitle' }, props.subtitle) : null,
        props.essence > 0 ? el('div', { className: 'reward-essence-line' }, `+${props.essence} ${UI.essence}`) : null,
        props.loot.length > 0 ? el('div', null, el('h3', null, UI.lootFound), lootGrid) : null,
        renderXpPanel(ctx),
        props.masterXp && props.masterXp.levelsGained > 0
          ? el('div', { className: 'reward-master-levelup' }, `${ctx.state.packmaster.name} reached level ${ctx.state.packmaster.level}! +${props.masterXp.skillPointsGained} skill point(s).`)
          : null,
        renderTamePanel(ctx, rerender),
        el(
          'button',
          {
            className: 'btn btn-primary reward-continue-btn',
            disabled: !tameResolved,
            onClick: () => props.onContinue(),
          },
          UI.confirm,
        ),
      ),
    );
  }

  return {
    mount(mountRoot: HTMLElement, ctx: GameContext): void {
      root = mountRoot;
      const { overflow } = applyRewardsOnce(ctx);
      render(ctx);
      if (overflow.length > 0) promptOverflowSalvage(ctx, overflow, () => render(ctx));
    },
    unmount(): void {
      if (root) root.innerHTML = '';
      root = null;
    },
  };
}
