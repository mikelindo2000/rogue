<script lang="ts">
  import { ui, actions } from '../store.svelte';
  import { FLOOR_TRANSITION_LIST } from '../floorTransition';

  // Prototype/dev affordance: flip the floor-change effect live so the options
  // can be felt back-to-back. Stop key events from bubbling to the global game
  // shortcuts so using the picker never moves the player or triggers search.
  function onKeydown(e: KeyboardEvent) {
    e.stopPropagation();
  }
</script>

<div class="fx-switcher" role="group" aria-label="Floor transition effect (dev)">
  <span class="fx-label">Floor FX</span>
  <div class="fx-options">
    {#each FLOOR_TRANSITION_LIST as t (t.id)}
      <button
        type="button"
        class="fx-option"
        class:active={ui.floorTransition === t.id}
        aria-pressed={ui.floorTransition === t.id}
        onclick={() => actions.setFloorTransition(t.id)}
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
