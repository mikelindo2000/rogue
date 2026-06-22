<script lang="ts">
  import type { LogLineView } from '../store.svelte';

  let { line }: { line: LogLineView } = $props();
</script>

<div class="line" class:highlight={line.highlight}>
  <span class="gutter">{line.n}</span>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted engine-produced colored spans -->
  <span class="msg">{@html line.html}</span>
</div>

<style>
  .line {
    display: flex;
    gap: 9px;
    padding: 5px 0;
  }
  .gutter {
    flex: none;
    width: 22px;
    text-align: right;
    font: 600 10.5px var(--font-display);
    font-variant-numeric: tabular-nums;
    color: var(--text-faintest);
  }
  .msg {
    font: 400 var(--fs-body) / 1.45 var(--font-ui);
    color: var(--text-muted);
  }
  .highlight {
    padding: 7px 9px;
    margin-top: 3px;
    background: var(--accent-log-surface);
    border-left: 2px solid var(--accent);
    border-radius: 0 8px 8px 0;
  }
  .highlight .gutter {
    color: var(--accent-deep);
  }
  .highlight .msg {
    color: var(--text);
  }
</style>
