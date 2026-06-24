<script lang="ts">
  import { ui } from '../store.svelte';
  import { alivePlayerPalette, drawAvatar, playerSpriteName } from '../../render/avatar';

  const avatarName = $derived(playerSpriteName(ui.playerSprite));
  let avatarCanvas = $state<HTMLCanvasElement>();

  $effect(() => {
    const canvas = avatarCanvas;
    const sprite = ui.playerSprite;
    if (!canvas) return;

    const size = 44;
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawAvatar(ctx, sprite, size / 2, size / 2 + 1, 34, alivePlayerPalette());
  });
</script>

<div class="card">
  <div class="avatar" aria-label="{avatarName} avatar" title={avatarName}>
    <canvas bind:this={avatarCanvas} aria-hidden="true"></canvas>
  </div>
  <div class="text">
    <div class="name">{ui.charName}</div>
    <div class="sub">
      Level {ui.level} · {avatarName}{ui.strengthDrain > 0 ? ` · -${ui.strengthDrain} STR` : ''}
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
    box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.34), 0 0 18px rgba(255, 211, 77, 0.08);
    overflow: hidden;
  }
  .avatar canvas {
    display: block;
    width: 44px;
    height: 44px;
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
