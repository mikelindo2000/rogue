<script lang="ts">
  import { ui, actions } from '../store.svelte';
  import { FLOOR_TRANSITION_LIST } from '../floorTransition';

  let groupEl: HTMLDivElement;

  function focusOption(index: number) {
    const buttons = Array.from(groupEl.querySelectorAll<HTMLButtonElement>('.fx-option'));
    buttons[index]?.focus();
  }

  function selectOption(index: number) {
    const next = FLOOR_TRANSITION_LIST[index];
    if (!next) return;
    actions.setFloorTransition(next.id);
    focusOption(index);
  }

  function activeIndex() {
    const idx = FLOOR_TRANSITION_LIST.findIndex(t => t.id === ui.floorTransition);
    return idx >= 0 ? idx : 0;
  }

  function clicked(id: string) {
    actions.setFloorTransition(id);
  }

  // Prototype/dev affordance: flip the floor-change effect live so the options
  // can be felt back-to-back. Keep keys scoped here so using the picker never
  // moves the player, and give the repeated control Rogue-style arrow parity.
  function onKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    const len = FLOOR_TRANSITION_LIST.length;
    const current = activeIndex();
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      selectOption((current + 1) % len);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      selectOption((current - 1 + len) % len);
    } else if (e.key === 'Home') {
      e.preventDefault();
      selectOption(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      selectOption(len - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const target = e.target as HTMLElement | null;
      const id = target?.closest<HTMLButtonElement>('.fx-option')?.dataset.fxId;
      if (id) actions.setFloorTransition(id);
    }
  }
</script>

<div
  class="fx-switcher"
  role="group"
  aria-label="Floor transition effect (dev)"
  bind:this={groupEl}
>
  <span class="fx-label">Floor FX</span>
  <div class="fx-options">
    {#each FLOOR_TRANSITION_LIST as t (t.id)}
      <button
        type="button"
        class="fx-option"
        class:active={ui.floorTransition === t.id}
        aria-pressed={ui.floorTransition === t.id}
        tabindex={ui.floorTransition === t.id ? 0 : -1}
        data-fx-id={t.id}
        onclick={() => clicked(t.id)}
        onkeydown={onKeydown}
      >
        {t.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .fx-switcher {
    position: absolute;
    top: 14px;
    right: 14px;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    background: var(--surface-overlay);
    backdrop-filter: blur(6px);
    border: 1px solid var(--border-chip);
    border-radius: var(--r-md);
    opacity: 0.55;
    transition: opacity 120ms ease;
  }
  .fx-switcher:hover {
    opacity: 1;
  }
  .fx-label {
    font: 600 var(--fs-xs, 11px) var(--font-ui);
    color: var(--text-muted);
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .fx-options {
    display: inline-flex;
    gap: 4px;
  }
  .fx-option {
    appearance: none;
    cursor: pointer;
    padding: 3px 8px;
    font: 500 var(--fs-xs, 11px) var(--font-ui);
    color: var(--text-muted);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--r-sm, 6px);
  }
  .fx-option:hover {
    color: var(--text);
    border-color: var(--border-chip);
  }
  .fx-option.active {
    color: var(--accent);
    border-color: var(--accent);
  }
  .fx-option:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  @media (max-width: 860px) {
    .fx-switcher {
      top: 10px;
      right: 10px;
    }
  }
</style>
