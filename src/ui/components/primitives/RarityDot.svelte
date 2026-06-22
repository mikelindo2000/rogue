<script lang="ts">
  let { color, glow = false }: { color: string; glow?: boolean } = $props();
</script>

<span class="dot" class:glow style:--dot={color}></span>

<style>
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--dot);
    flex: none;
  }
  .dot.glow {
    box-shadow: 0 0 6px color-mix(in srgb, var(--dot) 55%, transparent);
  }
</style>
