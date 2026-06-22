<script lang="ts">
  import KeyCap from './primitives/KeyCap.svelte';
</script>

<footer class="footer">
  <span class="hint">
    <KeyCap>↑↓←→</KeyCap>
    <span class="lbl">move</span>
  </span>
  <span class="hint">
    <KeyCap>i</KeyCap>
    <span class="lbl">inventory</span>
  </span>
  <span class="hint">
    <KeyCap>g</KeyCap>
    <span class="lbl">pick up</span>
  </span>
  <span class="hint">
    <KeyCap>e</KeyCap>
    <span class="lbl">eat</span>
  </span>
  <span class="hint">
    <KeyCap>&gt;</KeyCap>
    <span class="lbl">descend</span>
  </span>
  <span class="hint right">
    <KeyCap>?</KeyCap>
    <span class="lbl">all shortcuts</span>
  </span>
</footer>

<style>
  .footer {
    height: var(--footer-h);
    padding: 0 18px;
    background: var(--surface-bar);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .hint {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .hint.right {
    margin-left: auto;
  }
  .lbl {
    font: 500 var(--fs-sm) var(--font-ui);
    color: var(--text-dim);
  }
</style>
