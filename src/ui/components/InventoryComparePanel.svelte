<script lang="ts">
  import type { InventoryCell, InventoryComparisonView } from '../store.svelte';
  import Icon from './primitives/Icon.svelte';

  let { cell }: { cell?: InventoryCell } = $props();

  function toneLabel(row: InventoryComparisonView): string {
    if (row.tone === 'better') return 'Better';
    if (row.tone === 'worse') return 'Worse';
    if (row.tone === 'blocked') return 'Locked';
    return row.deltaLabel === 'swap' ? 'Swap' : 'Same';
  }
</script>

<aside class="compare" aria-label="Equipped comparison">
  <header>
    <span>Equipped</span>
    {#if cell?.statLabel}<strong class="tnum">{cell.statLabel}</strong>{/if}
  </header>

  {#if cell?.comparisons?.length}
    <div class="diagram">
      {#each cell.comparisons as row (`${row.slot}:${row.candidateStatLabel}`)}
        <section class="card" class:better={row.tone === 'better'} class:worse={row.tone === 'worse'} class:blocked={row.tone === 'blocked'}>
          <div class="slot-label">
            <span class="slot-icon"><Icon name={row.icon} size={15} /></span>
            <span>{row.slotLabel}</span>
            <strong>{toneLabel(row)}</strong>
          </div>

          <div class="flow">
            <div class="node current">
              <span>Equipped</span>
              <strong>{row.currentName}</strong>
              <em class="tnum">{row.currentStatLabel}</em>
            </div>
            <div class="delta tnum" aria-label={`Change ${row.deltaLabel}`}>{row.deltaLabel}</div>
            <div class="node candidate">
              <span>{row.candidateName ? 'After' : 'Pack'}</span>
              <strong style:color={row.candidateName ? 'var(--text)' : cell.rarityColor}>{row.candidateName ?? cell.label}</strong>
              <em class="tnum">{row.candidateStatLabel}</em>
            </div>
          </div>

          {#if row.note}
            <p>{row.note}</p>
          {/if}
        </section>
      {/each}
    </div>
  {:else}
    <div class="none">
      <span class="none-icon"><Icon name="pouch" size={20} /></span>
      <span>No gear slot</span>
    </div>
  {/if}
</aside>

<style>
  .compare {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-left: 1px solid var(--border);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--surface-rail) 78%, transparent), transparent),
      var(--surface-rail);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 45px;
    padding: 12px 12px 8px;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-dimmer);
    font: 700 var(--fs-slot-label) var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
  }

  header strong {
    color: var(--accent);
    letter-spacing: 0;
  }

  .diagram {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 12px;
    overflow: auto;
  }

  .card {
    border: 1px solid var(--border-slot);
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--surface-card) 84%, transparent);
    overflow: hidden;
  }

  .card.better {
    border-color: color-mix(in srgb, var(--good) 42%, var(--border-slot));
  }

  .card.worse {
    border-color: color-mix(in srgb, var(--danger) 36%, var(--border-slot));
  }

  .card.blocked {
    border-style: dashed;
  }

  .slot-label {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px;
    color: var(--text-muted);
    font: 700 var(--fs-xs) var(--font-display);
  }

  .slot-label strong {
    margin-left: auto;
    color: var(--text-label);
    font: inherit;
  }

  .slot-icon {
    display: inline-flex;
    color: var(--text-icon);
  }

  .flow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: stretch;
    gap: 6px;
    padding: 0 8px 8px;
  }

  .node {
    min-width: 0;
    padding: 7px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    background: var(--surface-inset);
  }

  .node span {
    display: block;
    margin-bottom: 4px;
    color: var(--text-dim);
    font: 650 var(--fs-micro) var(--font-display);
    text-transform: uppercase;
  }

  .node strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font: 650 var(--fs-xs) var(--font-ui);
  }

  .node em {
    display: block;
    margin-top: 3px;
    color: var(--text-label);
    font: 700 var(--fs-xs) var(--font-display);
    font-style: normal;
  }

  .delta {
    align-self: center;
    min-width: 29px;
    padding: 4px 5px;
    border-radius: var(--r-pill);
    border: 1px solid var(--border-chip);
    color: var(--text-muted);
    background: var(--surface-inset-2);
    text-align: center;
    font: 800 var(--fs-xs) var(--font-display);
  }

  .better .delta {
    color: var(--good-bright);
    border-color: color-mix(in srgb, var(--good) 50%, var(--border-chip));
  }

  .worse .delta {
    color: var(--danger-soft);
    border-color: color-mix(in srgb, var(--danger) 45%, var(--border-chip));
  }

  .blocked .delta {
    color: var(--text-faint);
    border-style: dashed;
  }

  p {
    margin: 0;
    padding: 0 9px 9px;
    color: var(--text-dim);
    font: 500 var(--fs-xs)/1.35 var(--font-ui);
  }

  .none {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 180px;
    color: var(--text-faint);
    font: 650 var(--fs-xs) var(--font-display);
    text-transform: uppercase;
  }

  .none-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border: 1px dashed var(--border-slot);
    border-radius: var(--r-md);
    background: var(--surface-inset);
  }

  @media (max-width: 1040px) {
    .compare {
      border-left: none;
      border-top: 1px solid var(--border);
    }
  }
</style>
