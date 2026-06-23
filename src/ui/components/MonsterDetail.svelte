<script lang="ts">
  import type { MonsterTemplate } from '../../types';
  import { ui } from '../store.svelte';
  import Modal from './primitives/Modal.svelte';
  import MonsterStage from './MonsterStage.svelte';
  import MonsterMention from './MonsterMention.svelte';
  import { monsterArtUrl } from '../monsterArt';

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
  const artUrl = $derived(monster ? monsterArtUrl(monster) : null);

  const lore = $derived(
    monster?.lore ??
      `A ${monster?.name ?? 'creature'} of the deep dungeon. You have faced it in battle and lived to record its measure.`,
  );
</script>

<Modal open={monster !== null} title={monster?.name ?? ''} onClose={onClose}>
  {#if monster}
    <div class="body">
      {#if artUrl}
        <div
          class="art-bg"
          style:background-image={`url("${artUrl}")`}
          aria-hidden="true"
        ></div>
      {/if}
      <div class="content">
        <!-- Remount the stage when the monster changes so a future prev/next
             detail-view navigation animates the right creature. -->
        {#key monster}
          <MonsterStage {monster} heroGlyph={ui.glyph} />
        {/key}

        <div class="meta">
          <div class="headline">
            <div class="title-row">
              <span class="name"><MonsterMention {monster} /></span>
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
    </div>
  {/if}
</Modal>

<style>
  .body {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 18px;
    width: min(70vw, 520px);
    overflow: hidden;
  }
  .body::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    background:
      linear-gradient(180deg, rgba(11, 13, 18, 0.62) 0%, rgba(11, 13, 18, 0.78) 46%, rgba(11, 13, 18, 0.9) 100%),
      radial-gradient(120% 80% at 92% 18%, rgba(11, 13, 18, 0.04), rgba(11, 13, 18, 0.48));
    pointer-events: none;
  }
  .art-bg {
    position: absolute;
    inset: -12% -8% auto 42%;
    height: min(58%, 340px);
    z-index: 0;
    background-position: center top;
    background-size: cover;
    opacity: 0.8;
    filter: saturate(0.95) contrast(1.05);
    pointer-events: none;
  }
  .content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .meta {
    display: flex;
    gap: 14px;
    align-items: flex-start;
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
  .name :global(.monster-mention__glyph) {
    width: 2.15em;
    height: 2.15em;
    margin-inline-end: 0.6em;
    font-size: 1.05em;
    border-radius: var(--r-md);
    vertical-align: -0.7em;
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
