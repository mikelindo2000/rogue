<script lang="ts">
  import { ui, actions } from '../store.svelte';
  import Modal from './primitives/Modal.svelte';
  import { balanceReport, curveReport, DEFAULT_BANDS, type Difficulty } from '../../ai/balance';
  import { shapeForTemplate } from '../../ai/archetypes';
  import { simulateRuns } from '../../ai/run';
  import {
    buildDevControls,
    getProcMultiplier,
    setProcMultiplier,
    PROC_PRESETS,
    type DevControl,
  } from '../devTools';

  // The Dev tab is gated out of production builds, mirroring the DEV-only
  // `window.rogueProcRate` helper in main.ts.
  const DEV = import.meta.env.DEV;

  // Monte-Carlo trials per monster. 250 is plenty for a stable win-rate and
  // keeps the panel snappy (≈8k short duels).
  const TRIALS = 250;
  // Full-run descents. 150 stays under ~0.5s on the main thread (each run is 20
  // level-gens + ~80 duels) while giving stable per-floor aggregates.
  const RUN_TRIALS = 150;

  let view = $state<'monsters' | 'run' | 'dev'>('monsters');
  let includeBosses = $state(false);

  // The dev controls are built once from the (currently config-only) context.
  // A future engine-backed control would pass { engine, ui } here — see the seam
  // in devTools.ts. The registry reads persisted state on demand, so we bump a
  // nonce after each mutation to force the Svelte re-read of isActive()/values.
  const devControls: DevControl[] = buildDevControls();
  let devNonce = $state(0);
  // `void devNonce` makes these getters re-run whenever a control mutates state.
  const procMultiplier = $derived.by(() => (void devNonce, getProcMultiplier()));
  function setProc(mult: number) {
    setProcMultiplier(mult);
    devNonce++;
  }
  function toggleDevControl(c: Extract<DevControl, { kind: 'toggle' }>) {
    c.setActive(!c.isActive());
    devNonce++;
  }
  function runDevControl(c: Extract<DevControl, { kind: 'action' }>) {
    c.run();
    devNonce++;
  }
  // Read inside the template (after `void devNonce`) so toggle state is live.
  const isToggleActive = (c: Extract<DevControl, { kind: 'toggle' }>) =>
    (void devNonce, c.isActive());

  // Recompute only while the panel is open (and when the boss toggle flips), so
  // it always reflects the current tunables/balance constants on reopen.
  const report = $derived.by(() => {
    if (!ui.balancePanelOpen || view !== 'monsters') return null;
    const opts = { trials: TRIALS, shapeFor: shapeForTemplate, includeBosses };
    return { rows: balanceReport(opts), curve: curveReport(opts) };
  });

  // Full-run report — the heavier pass. Computed ASYNCHRONOUSLY so switching to
  // the tab is instant: the effect below tracks the same inputs as the old
  // `$derived` (panel open + active tab), but defers the synchronous sim off the
  // render path via a macrotask. A generation token discards results from a
  // superseded request, so switching away mid-compute can't flash a stale value.
  let run = $state<ReturnType<typeof simulateRuns> | null>(null);
  let runGen = 0;

  $effect(() => {
    // Mirror the previous `$derived` dependencies.
    const active = ui.balancePanelOpen && view === 'run';
    if (!active) {
      // Leaving the tab (or closing the panel): invalidate any in-flight compute
      // and clear state so re-entering shows the loading state, not a stale run.
      runGen++;
      run = null;
      return;
    }
    // Already have a result for this activation — don't recompute redundantly.
    if (run) return;

    const gen = ++runGen;
    const handle = setTimeout(() => {
      if (gen !== runGen) return; // superseded — drop the result
      run = simulateRuns(RUN_TRIALS);
    }, 0);
    return () => clearTimeout(handle);
  });

  const deltaPct = (measured: number, assumed: number) => {
    if (assumed <= 0) return measured > 0 ? '+∞' : '0%';
    const d = ((measured - assumed) / assumed) * 100;
    return `${d >= 0 ? '+' : ''}${d.toFixed(0)}%`;
  };
  // Colour cue for "danger": low HP fraction / high death rate read hot.
  const hpColor = (frac: number) => (frac < 0.25 ? '#e5534b' : frac < 0.5 ? '#e0823d' : '#6b7280');
  const rateColor = (r: number) => (r > 0.25 ? '#e5534b' : r > 0.1 ? '#e0823d' : '#6b7280');

  const DIFF_COLOR: Record<Difficulty, string> = {
    trivial: '#6b7280',
    easy: '#3fb950',
    fair: '#d6a32e',
    hard: '#e0823d',
    lethal: '#e5534b',
  };

  const pct = (x: number) => `${Math.round(x * 100)}%`;

  function close() {
    actions.setBalancePanelOpen(false);
  }
</script>

<Modal open={ui.balancePanelOpen} title="Balance Report — dev" onClose={close}>
  <div class="balance-body">
    <div class="tabs">
      <button class="tab" class:active={view === 'monsters'} onclick={() => (view = 'monsters')}>Per-monster</button>
      <button class="tab" class:active={view === 'run'} onclick={() => (view = 'run')}>Full run</button>
      {#if DEV}
        <button class="tab" class:active={view === 'dev'} onclick={() => (view = 'dev')}>Dev</button>
      {/if}
    </div>

    <div class="tab-content">
    {#if view === 'monsters' && report}
      <div class="summary">
        <div class="chip">
          <span class="k">Target band</span>
          <span class="v">{pct(DEFAULT_BANDS.easy)}–{pct(DEFAULT_BANDS.hardUpper)} threat</span>
        </div>
        <div class="chip">
          <span class="k">In band</span>
          <span class="v" style:color={report.curve.inBandFraction > 0.6 ? DIFF_COLOR.easy : DIFF_COLOR.hard}>
            {pct(report.curve.inBandFraction)}
          </span>
        </div>
        <div class="chip">
          <span class="k">Flagged</span>
          <span class="v">{report.curve.flagged.length} / {report.rows.length}</span>
        </div>
        <div class="chip">
          <span class="k">Max floor jump</span>
          <span class="v">{report.curve.maxFloorJump.toFixed(3)}</span>
        </div>
        <label class="toggle">
          <input type="checkbox" bind:checked={includeBosses} />
          Bosses
        </label>
      </div>

      <div class="legend">
        {#each Object.entries(DIFF_COLOR) as [name, color]}
          <span class="lg"><span class="dot" style:background={color}></span>{name}</span>
        {/each}
      </div>

      <table>
        <thead>
          <tr>
            <th class="num">Flr</th>
            <th>Monster</th>
            <th>Difficulty</th>
            <th class="num">Threat</th>
            <th class="num">Win</th>
            <th class="num">TTK</th>
          </tr>
        </thead>
        <tbody>
          {#each report.rows as r (r.id)}
            <tr class:flagged={r.flagged}>
              <td class="num dim">{r.floor}</td>
              <td class="name">{r.name}</td>
              <td>
                <span class="badge" style:color={DIFF_COLOR[r.difficulty]} style:border-color={DIFF_COLOR[r.difficulty]}>
                  {r.difficulty}
                </span>
              </td>
              <td class="num">{r.analysis.threat.toFixed(2)}</td>
              <td class="num">{pct(r.winRate.winRate.point)}</td>
              <td class="num dim">{r.winRate.meanTtk.toFixed(1)}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      <p class="foot">
        Threat = fraction of the reference player's HP spent killing the monster at the floor it
        first appears. Win% / TTK are {TRIALS} seeded Monte-Carlo duels. The reference player curve
        is calibrated to the Full-run sim — re-run it when loot/XP change.
      </p>
    {/if}

    {#if view === 'run' && !run}
      <div class="loading">Computing full-run simulation…</div>
    {/if}

    {#if view === 'run' && run}
      <div class="summary">
        <div class="chip">
          <span class="k">Runs</span>
          <span class="v">{run.trials}</span>
        </div>
        <div class="chip">
          <span class="k">Clear rate</span>
          <span class="v" style:color={run.clearRate > 0.4 ? '#3fb950' : '#e0823d'}>{pct(run.clearRate)}</span>
        </div>
        <div class="chip">
          <span class="k">Potions used / run</span>
          <span class="v">{run.meanPotionsUsedPerRun.toFixed(2)}</span>
        </div>
        <div class="chip">
          <span class="k">Potions wasted / run</span>
          <span class="v">{run.meanPotionsWastedPerRun.toFixed(2)}</span>
        </div>
      </div>

      <h4 class="sec">Measured power curve vs reference</h4>
      <table>
        <thead>
          <tr>
            <th class="num">Flr</th>
            <th class="num">Lvl</th>
            <th class="num">Atk</th>
            <th class="num">vs ref</th>
            <th class="num">Def</th>
            <th class="num">vs ref</th>
            <th class="num">Max HP</th>
            <th class="num">vs ref</th>
          </tr>
        </thead>
        <tbody>
          {#each run.byFloor as f (f.floor)}
            <tr>
              <td class="num dim">{f.floor}</td>
              <td class="num">{f.meanLevel.toFixed(1)}</td>
              <td class="num">{f.meanAtk.toFixed(0)}</td>
              <td class="num dim">{f.assumedAtk.toFixed(0)} ({deltaPct(f.meanAtk, f.assumedAtk)})</td>
              <td class="num">{f.meanDef.toFixed(0)}</td>
              <td class="num dim">{f.assumedDef.toFixed(0)} ({deltaPct(f.meanDef, f.assumedDef)})</td>
              <td class="num">{f.meanMaxHp.toFixed(0)}</td>
              <td class="num dim">{f.assumedMaxHp.toFixed(0)}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      <h4 class="sec">Resource pressure</h4>
      <table>
        <thead>
          <tr>
            <th class="num">Flr</th>
            <th class="num">Dmg/floor</th>
            <th class="num">Low HP med</th>
            <th class="num">Low HP p10</th>
            <th class="num">Danger dip</th>
            <th class="num">Death</th>
            <th class="num">Pots used</th>
          </tr>
        </thead>
        <tbody>
          {#each run.byFloor as f (f.floor)}
            <tr>
              <td class="num dim">{f.floor}</td>
              <td class="num">{f.meanDamageTaken.toFixed(1)}</td>
              <td class="num" style:color={hpColor(f.medianLowestHpFrac)}>{pct(f.medianLowestHpFrac)}</td>
              <td class="num" style:color={hpColor(f.p10LowestHpFrac)}>{pct(Math.max(0, f.p10LowestHpFrac))}</td>
              <td class="num" style:color={rateColor(f.dangerDipRate)}>{pct(f.dangerDipRate)}</td>
              <td class="num" style:color={rateColor(f.deathRate)}>{pct(f.deathRate)}</td>
              <td class="num dim">{f.meanPotionsUsed.toFixed(2)}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      <p class="foot">
        {RUN_TRIALS} whole 1→20 descents through the real loot/XP/combat generators (greedy equip =
        upper-bound power). Floors 17-20 are survivorship-biased (only tanky runs reach them).
        Single-duel pressure only — real runs stack multi-monster, hunger and heroes on top.
      </p>
    {/if}

    {#if DEV && view === 'dev'}
      <div class="dev-list">
        {#each devControls as c (c.id)}
          <div class="dev-row">
            <div class="dev-meta">
              <span class="dev-label">{c.label}</span>
              {#if c.description}<span class="dev-desc">{c.description}</span>{/if}
            </div>
            <div class="dev-controls">
              {#if c.kind === 'toggle'}
                <button
                  class="dev-toggle"
                  class:on={isToggleActive(c)}
                  role="switch"
                  aria-checked={isToggleActive(c)}
                  onclick={() => toggleDevControl(c)}
                >
                  {isToggleActive(c) ? 'On' : 'Off'}
                </button>
              {:else}
                <button class="dev-action" onclick={() => runDevControl(c)}>{c.label}</button>
              {/if}
            </div>
          </div>
        {/each}

        <!-- Quick presets for the proc multiplier — same tunable as the toggle
             above and as window.rogueProcRate(n). Active state tracks the
             currently-persisted value. -->
        <div class="dev-row">
          <div class="dev-meta">
            <span class="dev-label">Ability proc multiplier</span>
            <span class="dev-desc">Current: {procMultiplier}× (1× = sheet proc rates)</span>
          </div>
          <div class="dev-controls">
            {#each PROC_PRESETS as preset (preset)}
              <button
                class="dev-preset"
                class:active={procMultiplier === preset}
                onclick={() => setProc(preset)}
              >
                {preset}×
              </button>
            {/each}
          </div>
        </div>
      </div>

      <p class="foot">
        Dev-only — hidden in production builds. These toggles read/write the live
        config tunables and take effect immediately (no reload). Add more controls
        by appending one entry to <code>buildDevControls()</code> in src/ui/devTools.ts.
      </p>
    {/if}
    </div>
  </div>
</Modal>

<style>
  .balance-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 18px;
    width: min(92vw, 760px);
    /* Fixed footprint so switching tabs never resizes the panel. The content
       region (below) scrolls internally when a tab overflows this height. The
       min/height pair keeps short tabs (Dev) the same size as tall ones. */
    height: min(72vh, 620px);
    min-height: min(72vh, 620px);
  }

  .tabs {
    flex-shrink: 0;
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
  }

  /* The only scrolling region: tabs (and footers) stay pinned, this fills the
     remaining fixed height and scrolls when content exceeds it. */
  .tab-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .tab {
    appearance: none;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 6px 12px;
    margin-bottom: -1px;
    font: 600 var(--fs-slot-label) var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-dimmer);
    cursor: pointer;
  }
  .tab.active {
    color: var(--text-bright);
    border-bottom-color: var(--accent-strong);
  }
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 160px;
    color: var(--text-dim);
    font: 600 var(--fs-sm) var(--font-ui);
  }
  .sec {
    margin: 6px 0 -2px;
    font: 600 var(--fs-slot-label) var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .chip {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 7px 11px;
    background: var(--surface-inset);
    border: 1px solid var(--border-slot);
    border-radius: var(--r-md);
  }
  .chip .k {
    font: 600 var(--fs-slot-label) var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-dimmer);
  }
  .chip .v {
    font: 700 var(--fs-value) var(--font-display);
    color: var(--text-bright);
    font-variant-numeric: tabular-nums;
  }
  .toggle {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    font: 600 var(--fs-sm) var(--font-ui);
    color: var(--text-muted);
    cursor: pointer;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .lg {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font: 600 var(--fs-micro) var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font: 500 var(--fs-sm) var(--font-ui);
  }
  thead th {
    position: sticky;
    top: 0;
    text-align: left;
    padding: 6px 8px;
    background: var(--surface-bar);
    border-bottom: 1px solid var(--border);
    font: 600 var(--fs-slot-label) var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-dimmer);
  }
  td {
    padding: 5px 8px;
    border-bottom: 1px solid var(--border-slot);
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .dim {
    color: var(--text-dim);
  }
  .name {
    color: var(--text-bright);
    font-weight: 600;
  }
  tr.flagged .name::after {
    content: ' •';
    color: var(--accent-strong);
  }
  .badge {
    display: inline-block;
    padding: 1px 7px;
    border: 1px solid;
    border-radius: var(--r-xs);
    font: 700 var(--fs-micro) var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    opacity: 0.95;
  }
  .foot {
    margin: 4px 0 0;
    font: 400 var(--fs-micro) var(--font-ui);
    line-height: 1.5;
    color: var(--text-dim);
  }
  .foot code {
    font-family: var(--font-mono, monospace);
    color: var(--text-muted);
  }

  /* Dev tab: a generic list of toggle/action/preset controls. */
  .dev-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .dev-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 11px;
    background: var(--surface-inset);
    border: 1px solid var(--border-slot);
    border-radius: var(--r-md);
  }
  .dev-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .dev-label {
    font: 600 var(--fs-sm) var(--font-ui);
    color: var(--text-bright);
  }
  .dev-desc {
    font: 400 var(--fs-micro) var(--font-ui);
    line-height: 1.45;
    color: var(--text-dim);
  }
  .dev-controls {
    display: flex;
    flex-shrink: 0;
    gap: 6px;
  }
  .dev-toggle,
  .dev-action,
  .dev-preset {
    appearance: none;
    cursor: pointer;
    padding: 5px 12px;
    background: var(--surface-bar);
    border: 1px solid var(--border-slot);
    border-radius: var(--r-xs);
    font: 700 var(--fs-micro) var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .dev-toggle.on,
  .dev-preset.active {
    color: var(--text-bright);
    border-color: var(--accent-strong);
    background: color-mix(in srgb, var(--accent-strong) 18%, transparent);
  }
  .dev-action:hover,
  .dev-toggle:hover,
  .dev-preset:hover {
    color: var(--text-bright);
    border-color: var(--accent-strong);
  }

  /* On mobile the Modal goes full-height and makes its content flex-fill, so
     let the body stretch to that area (still scrolling internally via
     .tab-content) rather than sitting as a short fixed-height island. */
  @media (max-width: 680px) {
    .balance-body {
      width: 100%;
      height: 100%;
      min-height: 0;
    }
  }
</style>
