<script lang="ts">
  import { ui, actions } from '../store.svelte';
  import StatChip from './primitives/StatChip.svelte';
  import Icon from './primitives/Icon.svelte';
</script>

<header class="bar">
  <div class="left">
    <div class="logo" aria-hidden="true">&gt;</div>
    <div class="floor">
      <div class="floor-meta">Floor {ui.floor} / {ui.floorMax}</div>
      <div class="floor-name">{ui.floorName}</div>
    </div>
  </div>
  <div class="right">
    <StatChip icon="coin" iconStroke="var(--accent-strong)" value={ui.gold} unit="gold" />
    <StatChip icon="shield" iconStroke="var(--text-muted)" value={ui.def} unit="def" />
    <StatChip label="Turn" value={ui.turn} />
    <button
      class="settings-btn"
      onclick={() => actions.setSettingsOpen(true)}
      aria-label="Settings"
      title="Settings ( , )"
    >
      <Icon name="sliders" size={16} />
    </button>
  </div>
</header>

<style>
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--bar-h);
    padding: 0 20px;
    background: var(--surface-bar);
    border-bottom: 1px solid var(--border);
  }
  .left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: var(--r-md);
    background: var(--surface-inset-2);
    border: 1px solid var(--border-slot);
    color: var(--accent);
    font: 700 16px var(--font-display);
  }
  .floor {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .floor-meta {
    font: 600 9.5px var(--font-display);
    letter-spacing: var(--tracking-caps-wide);
    text-transform: uppercase;
    color: var(--text-dimmer);
  }
  .floor-name {
    font: 600 14px var(--font-display);
    letter-spacing: var(--tracking-tight);
    color: var(--text-bright);
  }
  .right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .settings-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    margin-left: 2px;
    border-radius: var(--r-md);
    background: var(--surface-inset-2);
    border: 1px solid var(--border-slot);
    color: var(--text-muted);
    cursor: pointer;
    transition:
      color var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease),
      background var(--dur-fast) var(--ease);
  }
  .settings-btn:hover {
    color: var(--accent);
    border-color: var(--border-strong);
    background: var(--surface-card);
  }
</style>
