<script lang="ts">
  import { ui } from '../store.svelte';
</script>

<div class="card">
  <div class="avatar" aria-hidden="true">{ui.glyph}</div>
  <div class="text">
    <div class="name">{ui.charName}</div>
    <div class="sub">
      Level {ui.level} · {ui.charClass}{ui.strengthDrain > 0 ? ` · -${ui.strengthDrain} STR` : ''}
    </div>
  </div>
</div>

<style>
  .card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    flex: none;
    border-radius: var(--r-lg);
    background: var(--surface-inset-2);
    border: 1px solid var(--border-strong);
    color: var(--accent);
    font: 700 22px var(--font-display);
    text-shadow: 0 0 10px var(--accent-glow);
  }
  .text {
    min-width: 0;
  }
  .name {
    font: 600 var(--fs-title-lg) var(--font-display);
    letter-spacing: var(--tracking-tight);
    color: var(--text-bright);
  }
  .sub {
    margin-top: 3px;
    font: 500 12px var(--font-ui);
    color: var(--text-label);
  }
</style>
