/**
 * Event screen — a choice vignette (DESIGN §7): title, text, choice buttons
 * (with an outcome hint from the closed `EventDef` outcome vocabulary),
 * risk-gamble resolution via a per-node forked Rng, resolution text, and a
 * Continue that hands the resolved outcome back to the expedition map
 * (battle outcomes get built into an actual encounter there; everything
 * else has already been applied to `ctx.state` by the time Continue fires).
 */
import { applyEventOutcome, applyLootToInventory, resolveEventChoice, type EventOutcomeResult } from '../../core/run';
import type { DinoInstance, EventDef, ExpeditionState, Rng, SkillId, WorldTier } from '../../core/types';
import { UI } from '../../data/index';
import { itemCard } from '../components/itemCard';
import { el, toast } from '../dom';
import type { GameContext, Screen } from '../screenManager';

export interface EventScreenProps {
  event: EventDef;
  rng: Rng;
  active: DinoInstance[];
  reserve: DinoInstance[];
  skills: SkillId[];
  tier: WorldTier;
  itemLevel: number;
  /** Mirrors any loot/essence found here into the run's running tally, same as `rewardScreen` — see its prop doc. */
  exp?: ExpeditionState;
  onFinish: (result: EventOutcomeResult) => void;
}

type Choice = EventDef['choices'][number];

function outcomeHint(choice: Choice): string {
  const o = choice.outcome;
  const main = (() => {
    switch (o.kind) {
      case 'loot':
        return `Loot (rarity +${o.rarityBoost})`;
      case 'healTeam':
        return `Heal team ${o.percent}%`;
      case 'damageTeam':
        return `Damage team ${o.percent}%`;
      case 'essence':
        return `+${o.amount} essence`;
      case 'battle':
        return o.alpha ? 'Fight an Alpha' : 'Fight';
      case 'xp':
        return `+${o.amount} XP`;
      case 'nothing':
        return 'Nothing happens';
    }
  })();
  if (!choice.risk) return main;
  const elsePart = choice.risk.else.kind === 'nothing' ? 'nothing' : `-${choice.risk.else.percent}% team HP`;
  return `${Math.round(choice.risk.chance * 100)}% chance: ${main} — else ${elsePart}`;
}

function resolutionText(result: EventOutcomeResult, gambleFailed: boolean, outcomeKind: string): string {
  if (gambleFailed) {
    if (result.damagedPercent) return `The gamble fails! The pack takes ${result.damagedPercent}% damage.`;
    return 'The gamble fails, but nothing worse happens.';
  }
  switch (outcomeKind) {
    case 'loot':
      return 'You find something useful.';
    case 'healTeam':
      return `The pack recovers ${result.healedPercent}% HP.`;
    case 'damageTeam':
      return `The pack takes ${result.damagedPercent}% damage.`;
    case 'essence':
      return `You gain ${result.essenceGained} essence.`;
    case 'battle':
      return 'Something wild emerges!';
    case 'xp':
      return 'The pack learns something valuable.';
    default:
      return 'Nothing happens.';
  }
}

export function eventScreen(props: EventScreenProps): Screen {
  let root: HTMLElement | null = null;

  function render(ctx: GameContext, resolved?: { text: string; result: EventOutcomeResult }): void {
    if (!root) return;

    const choiceButtons = props.event.choices.map((choice) =>
      el(
        'button',
        {
          className: 'btn event-choice-btn',
          disabled: !!resolved,
          onClick: () => {
            const { outcome, gambleFailed } = resolveEventChoice(choice, props.rng);
            const result = applyEventOutcome(outcome, {
              active: props.active,
              reserve: props.reserve,
              skills: props.skills,
              tier: props.tier,
              itemLevel: props.itemLevel,
              rng: props.rng,
            });
            if (result.lootItems.length > 0) {
              const applied = applyLootToInventory(ctx.state.inventory, result.lootItems);
              ctx.state.inventory = applied.inventory;
              props.exp?.lootFound.push(...result.lootItems);
            }
            if (result.essenceGained > 0) {
              ctx.state.essence += result.essenceGained;
              if (props.exp) props.exp.essenceFound += result.essenceGained;
            }
            ctx.save();
            if (result.essenceGained > 0) toast(`+${result.essenceGained} essence`);
            render(ctx, { text: resolutionText(result, gambleFailed, outcome.kind), result });
          },
        },
        el('div', { className: 'event-choice-label' }, choice.label),
        el('div', { className: 'event-choice-hint' }, outcomeHint(choice)),
      ),
    );

    root.replaceChildren(
      el(
        'div',
        { className: 'event-screen panel' },
        el('h1', { className: 'event-title' }, props.event.title),
        el('p', { className: 'event-text' }, props.event.text),
        el('div', { className: 'event-choices' }, choiceButtons),
        resolved
          ? el(
              'div',
              { className: 'event-resolution' },
              el('p', null, resolved.text),
              resolved.result.lootItems.length > 0
                ? el('div', { className: 'reward-loot-grid' }, resolved.result.lootItems.map((i) => itemCard(i).root))
                : null,
              el('button', { className: 'btn btn-primary', onClick: () => props.onFinish(resolved.result) }, UI.confirm),
            )
          : null,
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
