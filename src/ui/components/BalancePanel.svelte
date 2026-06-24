<script lang="ts">
  import { ui, actions } from '../store.svelte';
  import Modal from './primitives/Modal.svelte';
  import { balanceReport, curveReport, DEFAULT_BANDS, type Difficulty } from '../../ai/balance';
  import { shapeForTemplate } from '../../ai/archetypes';

  // Monte-Carlo trials per monster. 250 is plenty for a stable win-rate and
  // keeps the panel snappy (≈8k short duels).
  const TRIALS = 250;

  let includeBosses = $state(false);

  // Recompute only while the panel is open (and when the boss toggle flips), so
  // it always reflects the current tunables/balance constants on reopen.
  const report = $derived.by(() => {
    if (!ui.balancePanelOpen) return null;
    const opts = { trials: TRIALS, shapeFor: shapeForTemplate, includeBosses };
    return { rows: balanceReport(opts), curve: curveReport(opts) };
  });

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
    {#if report}
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
        is a tunable modeling assumption (level≈floor, linear gear) — calibrate it against real
        playtests.
      </p>
    {/if}
  </div>
</Modal>

<style>
  .balance-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 18px;
    width: min(92vw, 760px);
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
</style>
