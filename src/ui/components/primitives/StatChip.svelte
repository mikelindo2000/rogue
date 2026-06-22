<script lang="ts">
  import Icon from './Icon.svelte';
  import type { IconName } from '../../icons';

  let {
    icon,
    iconStroke,
    label,
    value,
    unit,
  }: {
    icon?: IconName;
    iconStroke?: string;
    label?: string;
    value: string | number;
    unit?: string;
  } = $props();
</script>

<div class="chip">
  {#if icon}
    <span class="icon" style:color={iconStroke ?? 'var(--text-icon)'}>
      <Icon name={icon} size={14} />
    </span>
  {/if}
  {#if label}<span class="lead">{label}</span>{/if}
  <span class="value tnum">{value}</span>
  {#if unit}<span class="unit">{unit}</span>{/if}
</div>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 11px;
    background: var(--surface-inset);
    border: 1px solid var(--border-chip);
    border-radius: var(--r-md);
  }
  .icon {
    display: inline-flex;
    flex: none;
  }
  .lead {
    font: 500 11px var(--font-ui);
    color: var(--text-dimmer);
  }
  .value {
    font: 600 var(--fs-value) var(--font-display);
    color: var(--text-bright);
    font-variant-numeric: tabular-nums;
  }
  .unit {
    font: 500 11px var(--font-ui);
    color: var(--text-dimmer);
  }
</style>
