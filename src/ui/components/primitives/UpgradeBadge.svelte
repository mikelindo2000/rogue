<script lang="ts">
  import type { GearVerdict } from '../../gearCompare';

  // Glanceable "is this better?" marker. `compact` renders glyph-only chips for
  // tight spots (HUD slots, the inventory grid); the full form adds words for the
  // loadout hub's candidate rows. Renders nothing for the equipped item itself.
  let {
    verdict,
    strictlyBetter = false,
    isBest = false,
    compact = false,
  }: {
    verdict?: GearVerdict;
    strictlyBetter?: boolean;
    isBest?: boolean;
    compact?: boolean;
  } = $props();

  const show = $derived(isBest || strictlyBetter || verdict === 'upgrade' || verdict === 'downgrade');
</script>

{#if show}
  <span class="badges" class:compact>
    {#if isBest}
      <span class="badge best" title="Best option for this slot">
        <span class="glyph">★</span>{#if !compact}<span class="text">Best</span>{/if}
      </span>
    {/if}
    {#if strictlyBetter}
      <span class="badge strict" title="Better than equipped in every way">
        <span class="glyph">▲</span>{#if !compact}<span class="text">Strictly better</span>{/if}
      </span>
    {:else if verdict === 'upgrade'}
      <span class="badge up" title="Upgrade over equipped">
        <span class="glyph">▲</span>{#if !compact}<span class="text">Upgrade</span>{/if}
      </span>
    {:else if verdict === 'downgrade'}
      <span class="badge down" title="Downgrade from equipped">
        <span class="glyph">▼</span>{#if !compact}<span class="text">Downgrade</span>{/if}
      </span>
    {/if}
  </span>
{/if}

<style>
  .badges {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    border-radius: var(--r-pill);
    border: 1px solid var(--tint-border);
    background: var(--tint-bg);
    color: var(--tint-fg);
    font: 750 9px var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    white-space: nowrap;
  }
  .compact .badge {
    padding: 0;
    border: none;
    background: none;
    font-size: 10px;
  }
  .glyph {
    line-height: 1;
  }
  .best {
    --tint-fg: var(--accent-strong);
    --tint-bg: color-mix(in srgb, var(--accent-strong) 14%, transparent);
    --tint-border: color-mix(in srgb, var(--accent-strong) 45%, var(--border-chip));
  }
  .strict,
  .up {
    --tint-fg: var(--good-bright);
    --tint-bg: color-mix(in srgb, var(--good) 14%, transparent);
    --tint-border: color-mix(in srgb, var(--good) 45%, var(--border-chip));
  }
  .down {
    --tint-fg: var(--danger-soft);
    --tint-bg: color-mix(in srgb, var(--danger) 12%, transparent);
    --tint-border: color-mix(in srgb, var(--danger) 42%, var(--border-chip));
  }
</style>
