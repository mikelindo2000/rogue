<script lang="ts">
  import { ui, actions } from '../store.svelte';
  import StatChip from './primitives/StatChip.svelte';
  import Icon from './primitives/Icon.svelte';
</script>

<header class="bar">
  <div class="left">
    <div class="logo" aria-hidden="true">></div>
    <div class="floor">
      <div class="floor-meta">Floor {ui.floor} / {ui.floorMax}</div>
      <div class="floor-name">{ui.floorName}</div>
    </div>
    {#if ui.hasAmulet}
      <div class="amulet" title="Escape to Floor 1 to win">
        <span class="amulet-gem" aria-hidden="true">✦</span>
        <div class="amulet-text">
          <div class="amulet-name">Amulet of Ballard</div>
          <div class="amulet-goal">Escape to Floor 1</div>
        </div>
      </div>
    {/if}
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
    gap: 12px;
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
    min-width: 0;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .amulet {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px 4px 8px;
    border-radius: var(--r-md);
    border: 1px solid var(--accent-border);
    background: var(--accent-surface);
    animation: amulet-pulse 2.4s var(--ease) infinite;
  }
  .amulet-gem {
    font-size: 16px;
    line-height: 1;
    color: var(--accent);
  }
  .amulet-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .amulet-name {
    font: 600 12px var(--font-display);
    letter-spacing: var(--tracking-tight);
    color: var(--accent);
    white-space: nowrap;
  }
  .amulet-goal {
    font: 600 8.5px var(--font-display);
    letter-spacing: var(--tracking-caps-wide);
    text-transform: uppercase;
    color: var(--text-dimmer);
    white-space: nowrap;
  }
  @keyframes amulet-pulse {
    0%, 100% { border-color: var(--accent-border); }
    50% { border-color: var(--accent); }
  }
  .right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
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

  @media (max-width: 680px) {
    .bar {
      height: auto;
      min-height: var(--bar-h);
      padding: 8px 10px;
      align-items: flex-start;
    }

    .left {
      min-width: 0;
      gap: 9px;
    }

    .logo {
      width: 28px;
      height: 28px;
    }

    .floor-meta {
      font-size: 8.5px;
    }

    .floor-name {
      max-width: 126px;
      font-size: 13px;
      line-height: 1.1;
    }

    .right {
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 6px;
      max-width: 220px;
    }

    .right :global(.chip) {
      height: 28px;
      padding-inline: 8px;
      gap: 5px;
    }

    .right :global(.chip .unit),
    .right :global(.chip .lead) {
      display: none;
    }
  }
</style>
