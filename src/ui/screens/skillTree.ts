/**
 * Skill tree — 3 branches × 3 tiers (DESIGN §6), gated by
 * `progression.canUnlockSkill`, spend-1-point nodes, and a full respec for
 * essence (Phase 6 additive `SKILL_RESPEC_ESSENCE_COST`).
 */
import { SKILL_RESPEC_ESSENCE_COST } from '../../core/balance';
import { canUnlockSkill } from '../../core/progression';
import { unlockedCommands } from '../../core/run';
import type { SkillDef } from '../../core/types';
import { COMMANDS, SKILL_LIST, UI } from '../../data/index';
import { el, modal, toast, type ModalHandle } from '../dom';
import type { GameContext, Screen } from '../screenManager';
import { camp } from './camp';

const BRANCHES: SkillDef['branch'][] = ['tactician', 'handler', 'survivalist'];
const BRANCH_LABEL: Record<SkillDef['branch'], string> = {
  tactician: 'Tactician',
  handler: 'Handler',
  survivalist: 'Survivalist',
};

export function skillTree(): Screen {
  let root: HTMLElement | null = null;

  function confirmRespec(ctx: GameContext, rerender: () => void): void {
    const state = ctx.state;
    if (state.packmaster.skills.length === 0) {
      toast('No skills to respec.');
      return;
    }
    if (state.essence < SKILL_RESPEC_ESSENCE_COST) {
      toast(`Not enough essence (need ${SKILL_RESPEC_ESSENCE_COST}).`);
      return;
    }
    const handle: ModalHandle = modal({
      title: 'Respec skills?',
      content: `Refunds all ${state.packmaster.skills.length} spent points for ${SKILL_RESPEC_ESSENCE_COST} essence.`,
      actions: [
        { label: UI.cancel, onClick: () => handle.close() },
        {
          label: 'Respec',
          primary: true,
          onClick: () => {
            state.packmaster.skillPoints += state.packmaster.skills.length;
            state.packmaster.skills = [];
            state.essence -= SKILL_RESPEC_ESSENCE_COST;
            ctx.save();
            handle.close();
            rerender();
          },
        },
      ],
    });
  }

  function render(ctx: GameContext): void {
    if (!root) return;
    const state = ctx.state;
    const rerender = () => render(ctx);
    const owned = state.packmaster.skills;

    const columns = BRANCHES.map((branch) => {
      const skills = SKILL_LIST.filter((s) => s.branch === branch).sort((a, b) => a.tier - b.tier);
      const nodes = skills.map((skill) => {
        const isOwned = owned.includes(skill.id);
        const canUnlock = !isOwned && canUnlockSkill(owned, skill.id) && state.packmaster.skillPoints > 0;
        const locked = !isOwned && !canUnlockSkill(owned, skill.id);
        return el(
          'div',
          { className: `panel skill-node${isOwned ? ' skill-node-owned' : ''}${locked ? ' skill-node-locked' : ''}` },
          el('div', { className: 'skill-node-tier' }, `Tier ${skill.tier}`),
          el('div', { className: 'skill-node-name' }, skill.name),
          el('div', { className: 'skill-node-desc' }, skill.description),
          isOwned
            ? el('div', { className: 'skill-node-status' }, 'Unlocked')
            : el(
                'button',
                {
                  className: 'btn btn-primary skill-node-btn',
                  disabled: !canUnlock,
                  title: locked ? `Requires a Tier ${skill.tier - 1} node in ${BRANCH_LABEL[branch]}.` : undefined,
                  onClick: () => {
                    state.packmaster.skills = [...state.packmaster.skills, skill.id];
                    state.packmaster.skillPoints -= 1;
                    ctx.save();
                    rerender();
                  },
                },
                'Unlock (1 pt)',
              ),
        );
      });
      return el('div', { className: 'skill-branch-column' }, el('h2', { className: 'camp-panel-title' }, BRANCH_LABEL[branch]), nodes);
    });

    const commands = unlockedCommands(owned).map((id) => COMMANDS[id]?.name ?? id);

    root.replaceChildren(
      el(
        'div',
        { className: 'skill-screen' },
        el(
          'div',
          { className: 'pack-screen-header' },
          el('h1', null, `${UI.skills} — ${state.packmaster.skillPoints} unspent`),
          el('button', { className: 'btn', onClick: () => ctx.replace(camp) }, UI.back),
        ),
        el('div', { className: 'skill-commands-row' }, `Unlocked commands: ${commands.join(', ')}`),
        el('button', { className: 'btn skill-respec-btn', onClick: () => confirmRespec(ctx, rerender) }, `Respec (${SKILL_RESPEC_ESSENCE_COST} essence)`),
        el('div', { className: 'skill-branches' }, columns),
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
