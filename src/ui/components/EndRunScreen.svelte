<script lang="ts">
  import { ui, actions } from '../store.svelte';
  import { buildEndRunView, type EndRunStat } from '../endRunView';
  import KeyCap from './primitives/KeyCap.svelte';

  type TabId = 'story' | 'combat' | 'loot' | 'exploration' | 'records' | 'history';

  const TABS: Array<{ id: TabId; label: string }> = [
    { id: 'story', label: 'Run Story' },
    { id: 'combat', label: 'Combat' },
    { id: 'loot', label: 'Loot' },
    { id: 'exploration', label: 'Exploration' },
    { id: 'records', label: 'Records' },
    { id: 'history', label: 'History' },
  ];

  let activeTab = $state<TabId>('story');
  let selectedHistory = $state(0);
  let confirmClear = $state(false);
  let restartButton = $state<HTMLButtonElement | null>(null);
  let clearButton = $state<HTMLButtonElement | null>(null);
  let confirmClearButton = $state<HTMLButtonElement | null>(null);

  const summary = $derived(ui.endRunSummary);
  const view = $derived(
    summary
      ? buildEndRunView(summary, ui.endRunRecords, ui.endRunComparison, ui.endRunHistory)
      : null
  );
  const isOpen = $derived(!!summary && (ui.gameOver || ui.gameWon));
  const activeIndex = $derived(TABS.findIndex(t => t.id === activeTab));
  const activeStats: EndRunStat[] = $derived(
    !view ? [] :
    activeTab === 'story' ? view.story :
    activeTab === 'combat' ? view.combat :
    activeTab === 'loot' ? view.loot :
    activeTab === 'exploration' ? view.exploration :
    activeTab === 'records' ? view.recordStats :
    []
  );

  $effect(() => {
    if (isOpen) {
      requestAnimationFrame(() => restartButton?.focus());
    } else {
      activeTab = 'story';
      selectedHistory = 0;
      confirmClear = false;
    }
  });

  function selectTab(id: TabId) {
    activeTab = id;
    selectedHistory = 0;
    confirmClear = false;
  }

  function moveTab(delta: number) {
    const next = (activeIndex + delta + TABS.length) % TABS.length;
    selectTab(TABS[next].id);
  }

  function onKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      e.stopPropagation();
      actions.restart();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (confirmClear) confirmClear = false;
      restartButton?.focus();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      moveTab(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (activeTab === 'history' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      e.stopPropagation();
      const len = view?.history.length ?? 0;
      if (len === 0) return;
      selectedHistory = (selectedHistory + (e.key === 'ArrowDown' ? 1 : -1) + len) % len;
    }
  }

  function clearHistory() {
    actions.clearRunHistory();
    confirmClear = false;
    requestAnimationFrame(() => restartButton?.focus());
  }

  function requestClearHistory() {
    confirmClear = true;
    requestAnimationFrame(() => confirmClearButton?.focus());
  }

  function cancelClearHistory() {
    confirmClear = false;
    requestAnimationFrame(() => clearButton?.focus());
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if isOpen && view && summary}
  <div
    class="end-screen"
    role="dialog"
    aria-modal="true"
    aria-label="Run statistics"
    tabindex="-1"
  >
    <div class="panel">
      <header class="hero">
        <div>
          <p class="eyebrow">{view.outcomeLabel}</p>
          <h2>{view.title}</h2>
          <p class="subtitle">{view.subtitle}</p>
        </div>
        <div class="hero-meta">
          <span>{view.completedAt}</span>
          <span>{view.duration}</span>
          <span>Seed {summary.seed}</span>
        </div>
      </header>

      {#if view.recordBadges.length > 0}
        <div class="badges" aria-label="Record highlights">
          {#each view.recordBadges as badge}
            <span>{badge}</span>
          {/each}
        </div>
      {/if}

      <section class="headline" aria-label="Headline stats">
        {#each view.headline as stat}
          <div class="metric">
            <span class="metric-label">{stat.label}</span>
            <span class="metric-value">{stat.value}</span>
          </div>
        {/each}
      </section>

      <div class="tabs" role="tablist" aria-label="End-run sections">
        {#each TABS as tab}
          <button
            role="tab"
            aria-selected={activeTab === tab.id}
            class:active={activeTab === tab.id}
            onclick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </div>

      <section class="content" aria-live="polite">
        {#if activeTab === 'history'}
          <div class="history-head">
            <span>Result</span>
            <span>Score</span>
            <span>Floor</span>
            <span>Turns</span>
            <span>When</span>
          </div>
          {#if view.history.length === 0}
            <p class="empty">No browser history yet.</p>
          {:else}
            <div class="history" role="listbox" aria-label="Previous runs">
              {#each view.history as run, i}
                <button
                  class:selected={selectedHistory === i}
                  role="option"
                  aria-selected={selectedHistory === i}
                  onclick={() => selectedHistory = i}
                >
                  <span>{run.result}</span>
                  <span>{run.score}</span>
                  <span>{run.floor}</span>
                  <span>{run.turns}</span>
                  <span>{run.when}</span>
                </button>
              {/each}
            </div>
          {/if}
          <p class="local-note">Saved in this browser only.</p>
        {:else}
          <div class="stats-grid">
            {#each activeStats as stat}
              <div class="stat-row">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
                {#if stat.detail}<em>{stat.detail}</em>{/if}
              </div>
            {/each}
          </div>

          {#if activeTab === 'story' && summary.awards.length > 0}
            <div class="awards" aria-label="Awards">
              {#each summary.awards as award}
                <span>{award}</span>
              {/each}
            </div>
          {/if}
        {/if}
      </section>

      <footer class="actions">
        <button bind:this={restartButton} class="primary" onclick={() => actions.restart()}>
          Restart <KeyCap>R</KeyCap>
        </button>
        <button onclick={() => actions.copyEndRunSummary()}>Copy summary</button>
        {#if confirmClear}
          <span class="confirm" role="group" aria-label="Confirm clear history">
            <button bind:this={confirmClearButton} onclick={clearHistory}>Confirm clear</button>
            <button onclick={cancelClearHistory}>Cancel</button>
          </span>
        {:else}
          <button bind:this={clearButton} onclick={requestClearHistory}>Clear local history</button>
        {/if}
        {#if ui.endRunCopyStatus}
          <span class="copy-status">{ui.endRunCopyStatus}</span>
        {/if}
      </footer>
    </div>
  </div>
{/if}

<style>
  .end-screen {
    position: fixed;
    inset: 0;
    z-index: 8;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.62);
    backdrop-filter: blur(5px);
    outline: none;
  }
  .panel {
    width: min(980px, 96vw);
    max-height: min(760px, 92vh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border-popover);
    border-radius: var(--r-xl);
    background: var(--surface-app);
    box-shadow: var(--shadow-pop);
  }
  .hero {
    flex: none;
    display: flex;
    justify-content: space-between;
    gap: 18px;
    padding: 18px 20px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-bar);
  }
  .eyebrow {
    margin: 0 0 5px;
    font: 700 var(--fs-micro) var(--font-display);
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
  }
  h2 {
    margin: 0;
    font: 700 26px var(--font-display);
    color: var(--text-bright);
  }
  .subtitle {
    margin: 7px 0 0;
    color: var(--text-muted);
    font: 500 var(--fs-body) var(--font-ui);
  }
  .hero-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
    gap: 5px;
    color: var(--text-dimmer);
    font: 600 var(--fs-sm) var(--font-display);
    white-space: nowrap;
  }
  .badges {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 20px 0;
  }
  .badges span,
  .awards span {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    padding: 0 10px;
    border: 1px solid var(--border-chip);
    border-radius: var(--r-md);
    background: var(--surface-inset);
    color: var(--accent);
    font: 700 var(--fs-xs) var(--font-display);
    white-space: nowrap;
  }
  .headline {
    flex: none;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 1px;
    padding: 14px 20px;
  }
  .metric {
    min-width: 0;
    padding: 10px;
    background: var(--surface-inset);
    border: 1px solid var(--border-chip);
    border-radius: var(--r-md);
  }
  .metric-label {
    display: block;
    margin-bottom: 4px;
    color: var(--text-dimmer);
    font: 700 var(--fs-micro) var(--font-display);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
  }
  .metric-value {
    display: block;
    color: var(--text-bright);
    font: 700 18px var(--font-display);
  }
  .tabs {
    flex: none;
    display: flex;
    gap: 6px;
    padding: 0 20px 12px;
    overflow-x: auto;
  }
  .tabs button,
  .actions button {
    border: 1px solid var(--border-slot);
    border-radius: var(--r-md);
    background: var(--surface-inset);
    color: var(--text-muted);
    cursor: pointer;
    font: 700 var(--fs-sm) var(--font-display);
  }
  .tabs button {
    height: 30px;
    padding: 0 10px;
    white-space: nowrap;
  }
  .tabs button.active,
  .tabs button:focus-visible,
  .actions button:focus-visible {
    color: var(--text-bright);
    border-color: var(--accent);
    outline: none;
  }
  .content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 20px 16px;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .stat-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 10px;
    min-height: 38px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-rail);
  }
  .stat-row span {
    color: var(--text-muted);
    font: 600 var(--fs-sm) var(--font-ui);
  }
  .stat-row strong {
    color: var(--text-bright);
    font: 700 var(--fs-body) var(--font-display);
  }
  .stat-row em {
    grid-column: 1 / -1;
    color: var(--text-dimmer);
    font-style: normal;
    font-size: var(--fs-xs);
  }
  .awards {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .history-head,
  .history button {
    display: grid;
    grid-template-columns: 0.8fr 1fr 0.7fr 0.8fr 1.3fr;
    gap: 10px;
    align-items: center;
  }
  .history-head {
    padding: 0 10px 7px;
    color: var(--text-dimmer);
    font: 700 var(--fs-micro) var(--font-display);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
  }
  .history {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .history button {
    min-height: 34px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-rail);
    color: var(--text-muted);
    text-align: left;
    cursor: pointer;
    font: 600 var(--fs-sm) var(--font-ui);
  }
  .history button.selected,
  .history button:focus-visible {
    border-color: var(--accent);
    color: var(--text-bright);
    outline: none;
  }
  .empty,
  .local-note,
  .copy-status {
    color: var(--text-dimmer);
    font: 600 var(--fs-sm) var(--font-ui);
  }
  .actions {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--border);
    background: var(--surface-bar);
  }
  .actions button {
    min-height: 32px;
    padding: 0 11px;
  }
  .actions .primary {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--text-bright);
    border-color: var(--accent);
  }
  .confirm {
    display: inline-flex;
    gap: 6px;
  }
  @media (max-width: 820px) {
    h2 {
      font-size: 22px;
    }
    .hero {
      flex-direction: column;
      gap: 10px;
      padding: 12px 20px;
    }
    .hero-meta {
      align-items: flex-start;
    }
    .headline {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
