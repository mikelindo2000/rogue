<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<kbd class="cap">{@render children()}</kbd>

<style>
  .cap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-bottom-width: 2px;
    border-radius: var(--r-xs);
    font: 600 11px var(--font-display);
    color: var(--text-keycap);
  }
</style>
