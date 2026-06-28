// Declarative dev-tools registry rendered generically by the Dev tab in
// BalancePanel.svelte. The point is EXTENSIBILITY: adding a future dev toggle or
// action (god mode, jump to level, reveal map, spawn monster…) should mean
// adding ONE entry to buildDevControls() — never editing the panel template.
//
// Two control shapes cover the common cases:
//   - a stateful TOGGLE whose on/off reflects (and writes) some persisted/live
//     state, so the panel can show its active state and flip it.
//   - a one-shot ACTION button that just runs an effect.
//
// Controls are built from a context object so engine-dependent controls can be
// supported later. Today only config-based controls are wired (the proc-rate
// toggle needs nothing but src/config.ts), but the context already carries the
// optional live engine/ui seam — see DevToolsContext + the commented example at
// the bottom of buildDevControls().

import { getConfig, saveConfig } from '../config';
import { ui } from './store.svelte';

/** A stateful toggle: the panel reads `isActive()` to render its on/off state
 *  and calls `setActive()` on click. */
export interface DevToggleControl {
  kind: 'toggle';
  id: string;
  label: string;
  description?: string;
  isActive(): boolean;
  setActive(on: boolean): void;
}

/** A one-shot button: the panel calls `run()` on click. */
export interface DevActionControl {
  kind: 'action';
  id: string;
  label: string;
  description?: string;
  run(): void;
}

export type DevControl = DevToggleControl | DevActionControl;

/**
 * Context passed to the control factory. Config-based controls (the proc-rate
 * toggle) need none of this. Engine-backed controls (jump-to-level, spawn,
 * reveal map) will read `engine`/`ui` — both optional so the registry still
 * builds in headless contexts (tests, the balance sim) where no live engine
 * exists. Threading a real engine into BalancePanel is the only extra plumbing a
 * future engine-backed control needs; the registry shape already supports it.
 */
export interface DevToolsContext {
  // Typed loosely on purpose so devTools.ts stays decoupled from the engine
  // module graph (and importable from tests). A future engine-backed control
  // narrows this where it's used. See the commented example below.
  engine?: unknown;
  ui?: unknown;
}

/** The boosted multiplier the proc-rate toggle flips ON to. 15× turns a 3%
 *  ability into ~45% and a 1% into ~15% — frequent enough to witness on demand
 *  without being a guaranteed proc every hit. */
export const PROC_BOOST_MULTIPLIER = 15;

/** Preset proc-rate multipliers offered as quick buttons (1× = sheet rates). */
export const PROC_PRESETS = [1, 10, 25] as const;

/** Reads the persisted ability-proc multiplier (1 = sheet rates). */
export function getProcMultiplier(): number {
  return getConfig().abilityProcMultiplier;
}

/** Persists a new ability-proc multiplier. The engine reads it LIVE each turn
 *  (applyOnHitAbilities), so this takes effect immediately — no reload. Mirrors
 *  the `window.rogueProcRate(n)` dev console helper in src/main.ts. */
export function setProcMultiplier(mult: number): void {
  saveConfig({ ...getConfig(), abilityProcMultiplier: mult });
}

/**
 * Build the ordered list of dev controls the Dev tab renders. Add a future
 * control by appending ONE entry here.
 *
 * @param _ctx live engine/ui handles for engine-backed controls (unused today).
 */
export function buildDevControls(_ctx: DevToolsContext = {}): DevControl[] {
  const controls: DevControl[] = [
    {
      kind: 'toggle',
      id: 'proc-boost',
      label: 'Boost ability procs',
      description:
        `Crank monster on-hit ability proc rates to ${PROC_BOOST_MULTIPLIER}× so rare ` +
        `3%/1% abilities fire on demand. Off = sheet rates (1×).`,
      isActive: () => getProcMultiplier() > 1,
      setActive: (on) => setProcMultiplier(on ? PROC_BOOST_MULTIPLIER : 1),
    },
    {
      kind: 'toggle',
      id: 'show-sounds',
      label: 'Show sound debug overlay',
      description: 'Render a floating overlay on the left-hand side showing each sound asset played.',
      isActive: () => getConfig().showSoundDebug,
      setActive: (on) => {
        saveConfig({ ...getConfig(), showSoundDebug: on });
        ui.showSoundDebug = on;
      },
    },
  ];

  // SEAM — engine-backed controls go here once a live engine is threaded into
  // BalancePanel. Shape stays one entry; e.g. a "jump to level" action:
  //
  //   const engine = _ctx.engine as GameEngine | undefined;
  //   if (engine) {
  //     controls.push({
  //       kind: 'action',
  //       id: 'jump-to-level',
  //       label: 'Descend a floor',
  //       description: 'Generate and drop the player onto the next floor.',
  //       run: () => engine.debugDescend(),
  //     });
  //   }
  //
  // TODO: thread the live GameEngine/ui into BalancePanel (it currently takes no
  // props) and pass them here as { engine, ui } to unlock engine-backed controls.

  return controls;
}
