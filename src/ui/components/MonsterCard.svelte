<script lang="ts">
  import type { MonsterTemplate } from '../../types';

  let { monster }: { monster: MonsterTemplate } = $props();

  const isBoss = $derived(monster.special === 'boss');
</script>

<div class="card" class:boss={isBoss}>
  <div class="glyph-chip" style:color={monster.color}>
    <span class="glyph">{monster.symbol}</span>
  </div>
  <div class="details">
    <div class="name-row">
      <span class="name">{monster.name}</span>
      {#if isBoss}<span class="boss-tag">BOSS</span>{/if}
    </div>
    <div class="stats">
      <div class="stat">
        <span class="stat-label">HP</span>
        <span class="stat-val">{monster.hp}</span>
      </div>
      <div class="stat">
        <span class="stat-label">ATK</span>
        <span class="stat-val">{monster.atk}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Floor</span>
        <span class="stat-val">{monster.minFloor}+</span>
      </div>
    </div>
  </div>
</div>

<style>
  .card {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 11px 12px;
    background: var(--surface-card);
    border: 1px solid var(--border-slot);
    border-radius: var(--r-lg);
    transition:
      border-color var(--dur-fast) var(--ease),
      background var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
  }
  .card:hover {
    border-color: var(--border-strong);
    background: var(--surface-inset);
    transform: translateY(-1px);
  }

  .card.boss {
    border-color: var(--rarity-legendary);
    background: linear-gradient(
      135deg,
      var(--surface-card) 0%,
      var(--accent-surface) 100%
    );
  }
  .card.boss:hover {
    border-color: var(--accent-strong);
  }

  .glyph-chip {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    background: var(--surface-inset-2);
    border: 1px solid var(--border-slot);
    border-radius: var(--r-md);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .glyph {
    font: 700 18px var(--font-display);
    line-height: 1;
  }

  .details {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .name {
    font: 600 var(--fs-body) var(--font-ui);
    letter-spacing: var(--tracking-tight);
    color: var(--text-bright);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .boss-tag {
    flex: none;
    padding: 1px 5px;
    background: var(--accent-surface);
    border: 1px solid var(--accent-border);
    border-radius: var(--r-xs);
    font: 700 var(--fs-micro) var(--font-display);
    letter-spacing: var(--tracking-caps);
    color: var(--accent-strong);
  }

  .stats {
    display: flex;
    gap: 14px;
  }
  .stat {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }
  .stat-label {
    font: 600 var(--fs-slot-label) var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-dimmer);
  }
  .stat-val {
    font: 600 var(--fs-sm) var(--font-display);
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
</style>
