<script lang="ts">
  import { ui, actions } from '../store.svelte';
  import { buildEndRunView, type EndRunStat } from '../endRunView';
  import { assetReadinessService, type AssetReadinessHandle } from '../../assets/readiness';
  import { END_RUN_ART_READY_WAIT_MS, endRunArtReadinessPlan } from '../../assets/imageLoadPlans';
  import KeyCap from './primitives/KeyCap.svelte';
  import HowToPlay from './HowToPlay.svelte';

  type TabId = 'story' | 'howto' | 'combat' | 'loot' | 'exploration' | 'records' | 'history' | 'credits';

  const TABS: Array<{ id: TabId; label: string }> = [
    { id: 'story', label: 'Run Story' },
    { id: 'howto', label: 'How to Play' },
    { id: 'combat', label: 'Combat' },
    { id: 'loot', label: 'Loot' },
    { id: 'exploration', label: 'Exploration' },
    { id: 'records', label: 'Records' },
    { id: 'history', label: 'History' },
    { id: 'credits', label: 'Credits' },
  ];

  const CREDIT_ROWS = [
    ['Dungeon Direction', 'Mira Backspace'],
    ['Amulet Continuity', 'Theo Stacktrace'],
    ['Potion Safety', 'Brenda Breadcrumbs'],
    ['Floor Twenty Logistics', 'Lady Savefile'],
    ['Scroll Misreading', 'Quentin Quartermaster'],
    ['Gold Pile Accounting', 'Ada Goldstack'],
    ['Turn Counting', 'Tess Turncounter'],
    ['Final Stair Polishing', 'Gregory Hitpoint'],
    ['Closing Song', 'The Probably Cursed House Band'],
  ];

  let activeTab = $state<TabId>('story');
  let selectedHistory = $state(0);
  let confirmClear = $state(false);
  let artOpen = $state(true);
  let artRunId = $state<string | null>(null);
  let closeArtButton = $state<HTMLButtonElement | null>(null);
  let restartButton = $state<HTMLButtonElement | null>(null);
  let clearButton = $state<HTMLButtonElement | null>(null);
  let confirmClearButton = $state<HTMLButtonElement | null>(null);
  let creditRollKey = $state(0);
  let selectedArtKey: string | null = null;
  let renderedArtUrl = $state<string | null>(null);

  const summary = $derived(ui.endRunSummary);
  const view = $derived(
    summary
      ? buildEndRunView(summary, ui.endRunRecords, ui.endRunComparison, ui.endRunHistory)
      : null
  );
  const isOpen = $derived(!!summary && (ui.gameOver || ui.gameWon) && ui.endRunPresentationReady);
  const artPlan = $derived(summary ? endRunArtReadinessPlan(summary) : null);
  const endArt = $derived(artPlan?.selected ?? null);
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
      if (summary && artRunId !== summary.runId) {
        artRunId = summary.runId;
        artOpen = true;
      }
      requestAnimationFrame(() => (artOpen ? closeArtButton : restartButton)?.focus());
    } else {
      activeTab = 'story';
      selectedHistory = 0;
      confirmClear = false;
      artOpen = true;
      artRunId = null;
    }
  });

  $effect(() => {
    if (!summary || !artPlan) {
      selectedArtKey = null;
      renderedArtUrl = null;
      return;
    }

    const key = `${summary.runId}:${artPlan.selected.file}`;
    if (selectedArtKey === key) return;

    selectedArtKey = key;
    renderedArtUrl = null;

    const handle: AssetReadinessHandle = assetReadinessService.requestImage({
      kind: 'image',
      url: artPlan.selected.url,
      priority: 'critical-now',
      reason: 'opening end-run art',
      owner: 'end-run-screen',
      optional: true,
      isStale: () => ui.endRunSummary?.runId !== summary.runId,
    });
    let canceled = false;

    void handle.whenReady(END_RUN_ART_READY_WAIT_MS).then((ready) => {
      if (canceled || selectedArtKey !== key) return;
      renderedArtUrl = ready ? artPlan.selected.url : artPlan.fallback.url;
    });

    return () => {
      canceled = true;
      handle.cancel();
    };
  });

  function selectTab(id: TabId) {
    activeTab = id;
    selectedHistory = 0;
    confirmClear = false;
    if (id === 'credits') creditRollKey++;
  }

  function moveTab(delta: number) {
    const next = (activeIndex + delta + TABS.length) % TABS.length;
    selectTab(TABS[next].id);
  }

  function closeArt() {
    artOpen = false;
    requestAnimationFrame(() => restartButton?.focus());
  }

  function handleArtError() {
    if (!artPlan) return;
    if (renderedArtUrl !== artPlan.fallback.url) {
      renderedArtUrl = artPlan.fallback.url;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (artOpen) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        closeArt();
      }
      return;
    }
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

  function replayCredits() {
    creditRollKey++;
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
      {#if artOpen && endArt}
        <button
          bind:this={closeArtButton}
          class="art-curtain"
          aria-label="Close ending image and show run statistics"
          onclick={closeArt}
        >
          {#if renderedArtUrl}
            <img src={renderedArtUrl} alt="" onerror={handleArtError} />
          {/if}
          <span class="art-shade"></span>
          <span class="art-copy">
            <span class="eyebrow">{view.outcomeLabel}</span>
            <strong>{view.title}</strong>
            <span>{view.subtitle}</span>
          </span>
          <span class="art-close">
            Close image to see stats
            <KeyCap>Enter</KeyCap>
            <KeyCap>Esc</KeyCap>
          </span>
        </button>
      {:else}
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
          {:else if activeTab === 'howto'}
            <div class="howto-tab">
              <HowToPlay variant="tab" />
            </div>
          {:else if activeTab === 'credits'}
            <div class="credits-scene" aria-label="Credits">
              <div class="credits-window">
                {#key creditRollKey}
                  <div class="credits-roll">
                    <div class="credit-spacer"></div>
                    <p class="credits-title">{summary.outcome === 'won' ? 'The Amulet Returns' : 'The Dungeon Curtain Call'}</p>
                    {#each CREDIT_ROWS as row}
                      <p class="credit-row">
                        <span>{row[0]}</span>
                        <strong>{row[1]}</strong>
                      </p>
                    {/each}
                    <p class="credits-title small">Recorded locally in this browser</p>
                    <div class="credit-spacer"></div>
                  </div>
                {/key}
              </div>
              <button class="replay" onclick={replayCredits}>Replay credits</button>
            </div>
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
              <div class="legend" aria-label="Run legend">
                {#each view.legend as line}
                  <p>{line}</p>
                {/each}
              </div>
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
      {/if}
    </div>
  </div>
{/if}

<style>
  .howto-tab {
    padding: 6px 2px 4px;
  }
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
  .art-curtain {
    position: relative;
    flex: 1;
    min-height: min(760px, 92vh);
    padding: 0;
    overflow: hidden;
    border: 0;
    background: #000;
    color: var(--text-bright);
    cursor: pointer;
    text-align: left;
  }
  .art-curtain img,
  .art-shade {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .art-curtain img {
    object-fit: cover;
  }
  .art-shade {
    background:
      linear-gradient(180deg, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.05) 42%, rgba(0, 0, 0, 0.72)),
      radial-gradient(80% 74% at 50% 45%, transparent 46%, rgba(0, 0, 0, 0.55));
  }
  .art-copy,
  .art-close {
    position: absolute;
    z-index: 1;
  }
  .art-copy {
    left: clamp(18px, 4vw, 42px);
    right: clamp(18px, 4vw, 42px);
    bottom: clamp(72px, 12vh, 112px);
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 680px;
    text-shadow: 0 2px 18px rgba(0, 0, 0, 0.92);
  }
  .art-copy strong {
    font: 800 clamp(28px, 5vw, 52px) var(--font-display);
    line-height: 0.98;
  }
  .art-copy span:last-child {
    max-width: 540px;
    color: rgba(245, 238, 219, 0.88);
    font: 700 var(--fs-body) var(--font-ui);
  }
  .art-close {
    right: clamp(16px, 3vw, 28px);
    bottom: clamp(16px, 3vw, 24px);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 70%, white 10%);
    border-radius: var(--r-md);
    background: rgba(0, 0, 0, 0.68);
    color: var(--text-bright);
    font: 800 var(--fs-sm) var(--font-display);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  .art-curtain:focus-visible .art-close {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
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
  .legend {
    display: grid;
    gap: 7px;
    margin-top: 12px;
  }
  .legend p {
    margin: 0;
    padding: 9px 11px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-inset);
    color: var(--text-muted);
    font: 600 var(--fs-sm) var(--font-ui);
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
  .credits-scene {
    display: grid;
    gap: 12px;
  }
  .credits-window {
    position: relative;
    height: min(360px, 48vh);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background:
      linear-gradient(180deg, rgba(0, 0, 0, 0.62), transparent 24%, transparent 76%, rgba(0, 0, 0, 0.66)),
      var(--surface-inset);
  }
  .credits-roll {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 0 18px;
    animation: credits-roll 22s linear infinite;
  }
  .credit-spacer {
    height: 260px;
    flex: none;
  }
  .credits-title {
    margin: 0;
    color: var(--text-bright);
    font: 800 22px var(--font-display);
    text-align: center;
  }
  .credits-title.small {
    font-size: var(--fs-body);
    color: var(--accent);
  }
  .credit-row {
    width: min(520px, 100%);
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 14px;
    margin: 0;
    color: var(--text-muted);
    font: 700 var(--fs-sm) var(--font-display);
  }
  .credit-row span {
    color: var(--text-dimmer);
    text-align: right;
  }
  .credit-row strong {
    min-width: 0;
    color: var(--text-bright);
  }
  .replay {
    justify-self: start;
    min-height: 32px;
    padding: 0 11px;
    border: 1px solid var(--border-slot);
    border-radius: var(--r-md);
    background: var(--surface-inset);
    color: var(--text-muted);
    cursor: pointer;
    font: 700 var(--fs-sm) var(--font-display);
  }
  .replay:focus-visible {
    color: var(--text-bright);
    border-color: var(--accent);
    outline: none;
  }
  @keyframes credits-roll {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(-76%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .credits-roll {
      animation: none;
    }
    .credit-spacer {
      height: 24px;
    }
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
    .credit-row {
      grid-template-columns: 1fr;
      gap: 2px;
      text-align: center;
    }
    .credit-row span {
      text-align: center;
    }
  }
</style>
