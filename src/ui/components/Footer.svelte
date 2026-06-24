<script lang="ts">
  import KeyCap from './primitives/KeyCap.svelte';
  import { ui, actions } from '../store.svelte';
  import Icon from './primitives/Icon.svelte';

  const firstPotion = $derived(ui.potions[0]);
  const scrollCells = $derived(ui.inventoryItems.filter((c) => c.ref.kind === 'scroll'));
  const scrollCount = $derived(scrollCells.reduce((n, c) => n + (c.count ?? 1), 0));
  const firstScrollIcon = $derived(scrollCells[0]?.icon ?? 'book');
  let runMode = $state(false);

  function directional(dx: number, dy: number) {
    if (runMode && !ui.aiming) {
      actions.run(dx, dy);
      runMode = false;
      return;
    }
    actions.moveOrAim(dx, dy);
  }
</script>

<footer class="footer">
  <div class="desktop-hints">
    <span class="hint">
    <KeyCap>↑↓←→</KeyCap>
    <span class="lbl">move</span>
    </span>
    <span class="hint">
    <KeyCap>Shift</KeyCap>
    <span class="lbl">run</span>
    </span>
    <span class="hint">
    <KeyCap>i</KeyCap>
    <span class="lbl">inventory</span>
    </span>
    <span class="hint">
    <KeyCap>e</KeyCap>
    <span class="lbl">eat</span>
    </span>
    <span class="hint">
    <KeyCap>q</KeyCap>
    <span class="lbl">quaff</span>
    </span>
    <span class="hint">
    <KeyCap>Space</KeyCap>
    <span class="lbl">search</span>
    </span>
    <span class="hint">
    <KeyCap>r</KeyCap>
    <span class="lbl">read scroll</span>
    </span>
    <span class="hint">
    <KeyCap>m</KeyCap>
    <span class="lbl">bestiary</span>
    </span>
    <button class="hint right as-button" type="button" onclick={() => actions.setShortcutsOpen(true)}>
    <KeyCap>?</KeyCap>
    <span class="lbl">all shortcuts</span>
    </button>
  </div>

  <div class="mobile-controls" aria-label="Touch controls">
    <div class="dpad" aria-label={ui.aiming ? 'Aim wand' : 'Move'}>
      <button class="dir up" aria-label={ui.aiming ? 'Zap up' : runMode ? 'Run up' : 'Move up'} onclick={() => directional(0, -1)}>↑</button>
      <button class="dir left" aria-label={ui.aiming ? 'Zap left' : runMode ? 'Run left' : 'Move left'} onclick={() => directional(-1, 0)}>←</button>
      <button class="dir down" aria-label={ui.aiming ? 'Zap down' : runMode ? 'Run down' : 'Move down'} onclick={() => directional(0, 1)}>↓</button>
      <button class="dir right" aria-label={ui.aiming ? 'Zap right' : runMode ? 'Run right' : 'Move right'} onclick={() => directional(1, 0)}>→</button>
    </div>

    <div class="quick-actions">
      {#if ui.gameOver || ui.gameWon}
        <button class="quick primary" onclick={() => actions.restart()}>Restart</button>
      {:else if ui.aiming}
        <button class="quick" onclick={() => actions.cancelZap()}>Cancel</button>
      {:else}
        <button class="quick" onclick={() => actions.search()}>Search</button>
        <button
          class="quick"
          class:active={runMode}
          aria-pressed={runMode}
          onclick={() => (runMode = !runMode)}
        >Run</button>
        <button class="quick" onclick={() => actions.setInventoryOpen(true)}>Pack</button>
        <button class="quick" onclick={() => actions.setCompendiumOpen(true)}>Bestiary</button>
        <button class="quick icon" aria-label="Use potion" disabled={!firstPotion} onclick={() => firstPotion && actions.usePotion(firstPotion.idx)}>
          <Icon name={firstPotion?.icon ?? 'potion-healing'} size={16} />
          <span class="count tnum">{ui.potions.length}</span>
        </button>
        <button class="quick icon" aria-label="Eat" disabled={ui.food === 0} onclick={() => actions.eat()}>
          <Icon name="leaf" size={16} />
          <span class="count tnum">{ui.food}</span>
        </button>
        <button class="quick icon" aria-label="Read scroll" disabled={scrollCount === 0} onclick={() => actions.readScroll()}>
          <Icon name={firstScrollIcon} size={16} />
          <span class="count tnum">{scrollCount}</span>
        </button>
        <button class="quick" onclick={() => actions.drawFirstWand()}>Zap</button>
      {/if}
    </div>
  </div>
</footer>

<style>
  .footer {
    height: var(--footer-h);
    padding: 0 18px;
    background: var(--surface-bar);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    overflow: hidden;
  }
  .desktop-hints {
    display: flex;
    align-items: center;
    gap: 18px;
    width: 100%;
  }
  .hint {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .hint.right {
    margin-left: auto;
  }
  .as-button {
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    cursor: pointer;
  }
  .as-button:hover .lbl,
  .as-button:focus-visible .lbl {
    color: var(--text-bright);
  }
  .lbl {
    font: 500 var(--fs-sm) var(--font-ui);
    color: var(--text-dim);
  }
  .mobile-controls {
    display: none;
  }

  @media (max-width: 860px) {
    .footer {
      height: auto;
      padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
    }

    .desktop-hints {
      display: none;
    }

    .mobile-controls {
      display: grid;
      grid-template-columns: 116px minmax(0, 1fr);
      gap: 10px;
      width: 100%;
    }

    .dpad {
      display: grid;
      grid-template-columns: repeat(3, 36px);
      grid-template-rows: repeat(3, 32px);
      gap: 3px;
      justify-content: start;
      touch-action: manipulation;
    }

    .dir,
    .quick {
      border: 1px solid var(--border-slot);
      border-radius: var(--r-md);
      background: var(--surface-inset);
      color: var(--text);
      cursor: pointer;
      font: 800 13px var(--font-display);
      touch-action: manipulation;
    }

    .dir:active,
    .quick:active,
    .quick.active {
      border-color: var(--accent);
      background: var(--accent-surface);
      color: var(--text-bright);
    }

    .dir:disabled,
    .quick:disabled {
      opacity: 0.42;
      cursor: default;
    }

    .up { grid-column: 2; grid-row: 1; }
    .left { grid-column: 1; grid-row: 2; }
    .down { grid-column: 2; grid-row: 3; }
    .right { grid-column: 3; grid-row: 2; }

    .quick-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      min-width: 0;
    }

    .quick {
      min-width: 0;
      min-height: 32px;
      padding: 0 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-muted);
      font-size: 11px;
    }

    .quick.primary {
      grid-column: 1 / -1;
      color: var(--accent);
      border-color: var(--accent-border);
      background: var(--accent-surface);
    }

    .quick.icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
    }

    .count {
      color: var(--text-dimmer);
      font: 700 10px var(--font-display);
    }
  }
</style>
