<script lang="ts">
  import { ui } from '../store.svelte';
  import SectionLabel from './primitives/SectionLabel.svelte';
  import LogLine from './LogLine.svelte';

  let body = $state<HTMLDivElement | null>(null);

  $effect(() => {
    // Re-run on new lines, then scroll to bottom.
    void ui.logs.length;
    if (body) body.scrollTop = body.scrollHeight;
  });
</script>

<section class="log">
  <header>
    <SectionLabel text="Message log">
      {#snippet trailing()}
        <span class="dot" aria-hidden="true"></span>
      {/snippet}
    </SectionLabel>
  </header>
  <div class="body" bind:this={body}>
    {#each ui.logs as line (line.n)}
      <LogLine {line} />
    {/each}
  </div>
</section>

<style>
  .log {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  header {
    padding: 14px 14px 8px;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: var(--r-round);
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent-glow);
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 0 14px 14px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }
</style>
