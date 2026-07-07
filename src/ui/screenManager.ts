/**
 * Screen stack manager — per ARCHITECTURE.md §4.
 *
 * Screens implement `{ mount(root, ctx), unmount() }`. The manager keeps
 * a stack of mounted screens; only the top screen is visible. `push` adds
 * a new screen on top (previous screen stays mounted but hidden — its
 * DOM and closures survive, so returning to it via `pop` needs no
 * re-mount). `replace` swaps the top screen for a new one. `pop` unmounts
 * and removes the top screen, revealing the one beneath.
 */
import type { GameState } from '../core/types';

export interface Screen {
  mount(root: HTMLElement, ctx: GameContext): void;
  unmount(): void;
}

/** A screen factory: builds a fresh `Screen` instance from navigation props. */
export type ScreenFactory<Props = void> = (props: Props) => Screen;

/**
 * A mutable box holding the currently-active save slot index. It's a box
 * (not a plain number) so `main.ts`'s `save()` closure and every screen's
 * `ctx.activeSlot` see the same live value after MainMenu's New Game/Load
 * flow picks a slot — reassigning `ctx.state` would break the "same object
 * reference" trick `GameContext.state` relies on (see `main.ts`'s module
 * doc), so slot selection gets the same treatment.
 */
export interface ActiveSlotRef {
  value: number;
}

/**
 * Passed to every screen on mount. `goto` pushes a new screen (the common
 * case for forward navigation); `back` pops to the previous screen.
 *
 * `state` is one long-lived `GameState` object for the whole session —
 * screens mutate its fields/nested arrays in place (never reassign `ctx.state`
 * itself) so that `main.ts`'s `save()` closure, which captured the same
 * object reference at boot, always persists the current game.
 */
export interface GameContext {
  state: GameState;
  activeSlot: ActiveSlotRef;
  save(): void;
  goto<Props = void>(factory: ScreenFactory<Props>, props?: Props): void;
  /** Swaps the top screen in place (same stack depth) — the hub-and-spoke navigation (Camp <-> Pack/Gear/Skills/ExpeditionMap, node resolution) uses this exclusively so every screen mount re-reads the current `state` instead of reviving a screen that rendered a now-stale snapshot. */
  replace<Props = void>(factory: ScreenFactory<Props>, props?: Props): void;
  back(): void;
}

interface StackEntry {
  screen: Screen;
  el: HTMLElement;
}

export class ScreenManager {
  private readonly container: HTMLElement;
  private readonly stack: StackEntry[] = [];
  private readonly ctx: GameContext;

  constructor(container: HTMLElement, state: GameState, activeSlot: ActiveSlotRef, save: () => void) {
    this.container = container;
    this.ctx = {
      state,
      activeSlot,
      save,
      goto: (factory, props) => this.push(factory, props as never),
      replace: (factory, props) => this.replace(factory, props as never),
      back: () => this.pop(),
    };
  }

  /** Push a new screen on top of the stack. */
  push<Props = void>(factory: ScreenFactory<Props>, props?: Props): void {
    const currentTop = this.top();
    if (currentTop) currentTop.el.style.display = 'none';

    const el = document.createElement('div');
    el.className = 'screen';
    this.container.appendChild(el);

    const screen = factory(props as Props);
    screen.mount(el, this.ctx);
    this.stack.push({ screen, el });
  }

  /** Unmount and remove the top screen, revealing the one beneath (if any). */
  pop(): void {
    const popped = this.stack.pop();
    if (!popped) return;
    popped.screen.unmount();
    popped.el.remove();

    const newTop = this.top();
    if (newTop) newTop.el.style.display = '';
  }

  /** Unmount the top screen and mount a new one in its place (same stack depth). */
  replace<Props = void>(factory: ScreenFactory<Props>, props?: Props): void {
    const popped = this.stack.pop();
    if (popped) {
      popped.screen.unmount();
      popped.el.remove();
    }
    this.push(factory, props);
  }

  /** Number of screens currently on the stack. */
  get depth(): number {
    return this.stack.length;
  }

  private top(): StackEntry | undefined {
    return this.stack[this.stack.length - 1];
  }
}
