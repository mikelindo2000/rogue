<script lang="ts">
  import type { MonsterTemplate } from '../../types';
  import type { MonsterTier } from '../../discovery';
  import { hpBand, atkBand } from '../../discovery';
  import { monsterArtUrl } from '../monsterArt';

  let {
    monster,
    tier,
    firstSeenFloor,
    killCount = 0,
    onView,
  }: {
    monster: MonsterTemplate;
    tier: MonsterTier;
    firstSeenFloor?: number;
    killCount?: number;
    onView?: () => void;
  } = $props();

  const isBoss = $derived(monster.special === 'boss');
  const locked = $derived(tier === 'unknown');
  const defeated = $derived(tier === 'defeated');
  const artUrl = $derived(locked ? null : monsterArtUrl(monster));
</script>

{#if locked}
  <div class="card locked" aria-label="Undiscovered monster">
    <div class="glyph-chip">
      <span class="glyph">?</span>
    </div>
    <div class="details">
      <div class="name-row">
        <span class="name">???</span>
      </div>
      <div class="stats">
        <span class="hint">Not yet discovered</span>
      </div>
    </div>
  </div>
{:else}
  <div class="card" class:boss={isBoss} class:clickable={defeated}>
    {#if artUrl}
      <div
        class="art-bg"
        style:background-image={`url("${artUrl}")`}
        aria-hidden="true"
      ></div>
    {/if}
    <button
      class="hit"
      type="button"
      disabled={!defeated}
      onclick={() => onView?.()}
      aria-label={defeated ? `View ${monster.name} preview` : monster.name}
    ></button>
    <div class="glyph-chip" style:color={monster.color}>
      <span class="glyph">{monster.symbol}</span>
    </div>
    <div class="details">
      <div class="name-row">
        <span class="name">{monster.name}</span>
        {#if isBoss}<span class="boss-tag">BOSS</span>{/if}
      </div>

      {#if defeated}
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
          {#if killCount > 0}
            <div class="stat">
              <span class="stat-label">Slain</span>
              <span class="stat-val">{killCount}</span>
            </div>
          {/if}
        </div>
        <span class="view-hint">View preview →</span>
      {:else}
        <!-- seen: coarse bands, no exact numbers -->
        <div class="stats">
          <div class="stat">
            <span class="stat-label">HP</span>
            <span class="stat-val band">{hpBand(monster.hp)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Threat</span>
            <span class="stat-val band">{atkBand(monster.atk)}</span>
          </div>
        </div>
        <span class="seen-hint">
          First seen: Floor {firstSeenFloor ?? monster.minFloor} · defeat to learn more
        </span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .card {
    position: relative;
    display: flex;
    gap: 12px;
    align-items: center;
    min-height: 112px;
    padding: 11px 12px;
    background: var(--surface-card);
    border: 1px solid var(--border-slot);
    border-radius: var(--r-lg);
    overflow: hidden;
    transition:
      border-color var(--dur-fast) var(--ease),
      background var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
  }
  .card::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    background:
      linear-gradient(90deg, rgba(18, 20, 27, 0.72) 0%, rgba(18, 20, 27, 0.5) 52%, rgba(18, 20, 27, 0.24) 100%),
      radial-gradient(110% 120% at 100% 50%, rgba(18, 20, 27, 0), rgba(18, 20, 27, 0.34));
    pointer-events: none;
  }
  .art-bg {
    position: absolute;
    inset: -22%;
    z-index: 0;
    background-position: right top;
    background-size: cover;
    opacity: 0.8;
    filter: saturate(0.92) contrast(1.08);
    pointer-events: none;
  }
  .card.clickable:hover {
    border-color: var(--border-strong);
    background: var(--surface-inset);
    transform: translateY(-1px);
  }

  /* Full-card click target sits above the visual layers. */
  .hit {
    position: absolute;
    inset: 0;
    border: none;
    background: transparent;
    padding: 0;
    margin: 0;
    border-radius: var(--r-lg);
    cursor: pointer;
    z-index: 3;
  }
  .hit:disabled {
    cursor: default;
  }
  .hit:focus-visible {
    outline: 2px solid var(--accent-border);
    outline-offset: 2px;
  }

  .card.boss {
    border-color: var(--rarity-legendary);
    background: linear-gradient(
      135deg,
      var(--surface-card) 0%,
      var(--accent-surface) 100%
    );
  }
  .card.boss.clickable:hover {
    border-color: var(--accent-strong);
  }

  /* Locked silhouette */
  .card.locked {
    border-style: dashed;
    opacity: 0.7;
  }
  .card.locked .glyph-chip {
    color: var(--text-dimmer);
  }
  .card.locked .glyph {
    opacity: 0.5;
  }
  .card.locked .name {
    color: var(--text-dim);
    letter-spacing: 0.15em;
  }

  .glyph-chip {
    position: relative;
    z-index: 2;
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
    position: relative;
    z-index: 2;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: none;
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
    flex-wrap: wrap;
    column-gap: 14px;
    row-gap: 4px;
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
  .stat-val.band {
    font-variant-numeric: normal;
    color: var(--text-muted);
  }

  .hint,
  .seen-hint,
  .view-hint {
    font: 500 var(--fs-micro) var(--font-ui);
    color: var(--text-dim);
  }
  .view-hint {
    color: var(--accent-strong);
  }
</style>
