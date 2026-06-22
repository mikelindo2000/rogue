<script lang="ts">
  import type { MonsterTemplate } from '../../types';
  import Modal from './primitives/Modal.svelte';
  import MonsterStage from './MonsterStage.svelte';

  let {
    monster,
    killCount = 0,
    firstSeenFloor,
    onClose,
  }: {
    monster: MonsterTemplate | null;
    killCount?: number;
    firstSeenFloor?: number;
    onClose: () => void;
  } = $props();

  const isBoss = $derived(monster?.special === 'boss');

  const lore = $derived(
    monster?.lore ??
      `A ${monster?.name ?? 'creature'} of the deep dungeon. You have faced it in battle and lived to record its measure.`,
  );
</script>

<Modal open={monster !== null} title={monster?.name ?? ''} onClose={onClose}>
  {#if monster}
    <div class="body">
      <MonsterStage {monster} />

      <div class="meta">
        <div class="glyph-chip" style:color={monster.color}>
          <span class="glyph">{monster.symbol}</span>
        </div>
        <div class="headline">
          <div class="title-row">
            <span class="name">{monster.name}</span>
            {#if isBoss}<span class="boss-tag">BOSS</span>{/if}
          </div>
          <p class="lore">{lore}</p>
        </div>
      </div>

      <div class="statgrid">
        <div class="stat">
          <span class="label">Health</span>
          <span class="val">{monster.hp}</span>
        </div>
        <div class="stat">
          <span class="label">Attack</span>
          <span class="val">{monster.atk}</span>
        </div>
        <div class="stat">
          <span class="label">First floor</span>
          <span class="val">{monster.minFloor}</span>
        </div>
        <div class="stat">
          <span class="label">First seen</span>
          <span class="val">Floor {firstSeenFloor ?? monster.minFloor}</span>
        </div>
        <div class="stat">
          <span class="label">Times slain</span>
          <span class="val">{killCount}</span>
        </div>
      </div>
    </div>
  {/if}
</Modal>

<style>
  .body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 18px;
    width: min(70vw, 520px);
  }

  .meta {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
  .glyph-chip {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    background: var(--surface-inset-2);
    border: 1px solid var(--border-slot);
    border-radius: var(--r-md);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .glyph {
    font: 800 24px var(--font-display);
    line-height: 1;
  }
  .headline {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .name {
    font: 700 var(--fs-title) var(--font-display);
    letter-spacing: var(--tracking-tight);
    color: var(--text-bright);
  }
  .boss-tag {
    padding: 1px 6px;
    background: var(--accent-surface);
    border: 1px solid var(--accent-border);
    border-radius: var(--r-xs);
    font: 700 var(--fs-micro) var(--font-display);
    letter-spacing: var(--tracking-caps);
    color: var(--accent-strong);
  }
  .lore {
    margin: 0;
    font: 400 var(--fs-body) var(--font-ui);
    line-height: 1.45;
    color: var(--text-muted);
  }

  .statgrid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 9px 11px;
    background: var(--surface-inset);
    border: 1px solid var(--border-slot);
    border-radius: var(--r-md);
  }
  .label {
    font: 600 var(--fs-slot-label) var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-dimmer);
  }
  .val {
    font: 700 var(--fs-value) var(--font-display);
    color: var(--text-bright);
    font-variant-numeric: tabular-nums;
  }
</style>
