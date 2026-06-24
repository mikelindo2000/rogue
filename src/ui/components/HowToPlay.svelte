<script lang="ts">
  import KeyCap from './primitives/KeyCap.svelte';
  import { ui, actions } from '../store.svelte';
  import { formatKeyLabel } from '../../keyboard';

  // Whether the guide is shown inside the first-run intro gate (vs. the end
  // screen's reference tab). The gate gets a stronger framing line.
  let { variant = 'tab' }: { variant?: 'intro' | 'tab' } = $props();

  const STEPS = [
    'Move with the arrow keys or WASD. Step into a monster to attack it.',
    'Mind your hunger — eat before it empties. Quaff potions and read scrolls for an edge.',
    'Find the down-stairs on each floor and descend. The Amulet of Ballard waits at the bottom.',
    'Seize the Amulet, then climb all the way back to floor 1 to win. Death is permanent.',
  ];

  // Concise labels for the "essentials" grid, keyed by the binding's primary key.
  // Pulling the actual keys from ui.shortcuts keeps this from drifting if a
  // binding is re-keyed; the full reference lives in the ? shortcuts modal.
  const SHORT_LABELS: Record<string, string> = {
    i: 'Inventory',
    e: 'Eat food',
    q: 'Quaff potion',
    r: 'Read scroll',
    ' ': 'Search walls',
    m: 'Bestiary',
    z: 'Zap wand',
    '?': 'All shortcuts',
  };
  const FEATURED_KEYS = Object.keys(SHORT_LABELS);

  const featured = $derived(
    FEATURED_KEYS.map((key) => {
      const binding = ui.shortcuts.find(
        (s) => s.context === 'game' && s.keys.some((k) => k.toLowerCase() === key)
      );
      return binding ? { keys: binding.keys, label: SHORT_LABELS[key] } : null;
    }).filter((x): x is { keys: string[]; label: string } => x !== null)
  );
</script>

<div class="howto" class:intro={variant === 'intro'}>
  <p class="lede">
    You are the Wretch. Descend into the dungeon, tear the Amulet of Ballard from
    its depths, and claw your way back to the surface. Almost no one returns.
  </p>

  <ol class="steps">
    {#each STEPS as step}
      <li>{step}</li>
    {/each}
  </ol>

  <div class="keys-head">Essential controls</div>
  <div class="keys-grid">
    <div class="key-row">
      <span class="caps">
        <KeyCap>↑</KeyCap><KeyCap>↓</KeyCap><KeyCap>←</KeyCap><KeyCap>→</KeyCap>
      </span>
      <span class="key-label">Move (or WASD)</span>
    </div>
    <div class="key-row">
      <span class="caps"><KeyCap>Shift</KeyCap></span>
      <span class="key-label">Hold to run</span>
    </div>
    {#each featured as item}
      <div class="key-row">
        <span class="caps">
          {#each item.keys as k}<KeyCap>{formatKeyLabel(k)}</KeyCap>{/each}
        </span>
        <span class="key-label">{item.label}</span>
      </div>
    {/each}
  </div>

  <p class="more">
    Press
    <button class="link" type="button" onclick={() => actions.setShortcutsOpen(true)}>
      <KeyCap>?</KeyCap> all shortcuts
    </button>
    at any time for the full list of controls.
  </p>
</div>

<style>
  .howto {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 560px;
  }
  .lede {
    margin: 0;
    font: 500 var(--fs-body) var(--font-ui);
    line-height: 1.55;
    color: var(--text-muted);
  }
  .howto.intro .lede {
    font-size: var(--fs-title);
    color: var(--text-bright);
  }
  .steps {
    margin: 0;
    padding-left: 1.25em;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .steps li {
    font: 500 var(--fs-sm) var(--font-ui);
    line-height: 1.5;
    color: var(--text-muted);
  }
  .keys-head {
    margin-top: 2px;
    font: 700 9px var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-label);
  }
  .keys-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 18px;
  }
  .key-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .caps {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    flex: none;
  }
  .key-label {
    font: 500 var(--fs-sm) var(--font-ui);
    color: var(--text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .more {
    margin: 4px 0 0;
    font: 500 var(--fs-xs) var(--font-ui);
    color: var(--text-dim);
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--accent);
    cursor: pointer;
  }
  .link:hover,
  .link:focus-visible {
    color: var(--text-bright);
  }

  @media (max-width: 560px) {
    .keys-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
