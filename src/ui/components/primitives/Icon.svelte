<script lang="ts">
  import { ICONS, type IconName } from '../../icons';

  let {
    name,
    size = 18,
    stroke = 1.5,
  }: { name: IconName; size?: number; stroke?: number } = $props();
</script>

<svg
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- static, trusted icon path data -->
  {@html ICONS[name]}
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
