<script lang="ts">
  import Modal from './primitives/Modal.svelte';
  import Icon from './primitives/Icon.svelte';
  import type { IconName } from '../icons';
  import { ui, actions } from '../store.svelte';
  import { BOARD_SIZES, type BoardSizeId } from '../../boards';

  const BOARD_OPTIONS: BoardSizeId[] = ['classic', 'large', 'huge'];

  type SectionId = 'audio' | 'gameplay' | 'display';
  interface Section {
    id: SectionId;
    label: string;
    icon: IconName;
    hint: string;
    soon?: boolean;
  }

  // The settings shell is built to grow: add a section here and a matching
  // panel below. Audio ships now; the rest telegraph what's coming.
  const SECTIONS: Section[] = [
    { id: 'audio', label: 'Audio', icon: 'volume', hint: 'Sound effects & music' },
    { id: 'gameplay', label: 'Gameplay', icon: 'sword', hint: 'Difficulty & rules', soon: true },
    { id: 'display', label: 'Display', icon: 'sliders', hint: 'Board & visuals' },
  ];

  let active = $state<SectionId>('audio');
  const volumePct = $derived(Math.round(ui.audioVolume * 100));
  const musicVolumePct = $derived(Math.round(ui.musicVolume * 100));

  function close() {
    actions.setSettingsOpen(false);
  }

  function selectSection(s: Section) {
    if (!s.soon) active = s.id;
  }

  // Arrow keys move between enabled sections, Rogue-style list navigation.
  function onNavKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const enabled = SECTIONS.filter((s) => !s.soon);
    const i = enabled.findIndex((s) => s.id === active);
    const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
    const target = enabled[(next + enabled.length) % enabled.length];
    if (target) active = target.id;
  }

  function onVolumeInput(e: Event) {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    actions.setAudioVolume(v / 100);
  }

  function toggleMute() {
    actions.setAudioMuted(!ui.audioMuted);
  }

  function onMusicVolumeInput(e: Event) {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    actions.setMusicVolume(v / 100);
  }

  function toggleMusicMute() {
    actions.setMusicMuted(!ui.musicMuted);
  }

  // Roving arrow-key selection for the board-size radiogroup (keyboard-first).
  function onBoardKey(e: KeyboardEvent) {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const i = BOARD_OPTIONS.indexOf(ui.boardSize);
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    const next = BOARD_OPTIONS[(i + dir + BOARD_OPTIONS.length) % BOARD_OPTIONS.length];
    actions.setBoardSize(next);
    const buttons = (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button');
    buttons[BOARD_OPTIONS.indexOf(next)]?.focus();
  }
</script>

<Modal open={ui.settingsOpen} title="Settings" onClose={close}>
  <div class="settings">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <nav class="nav" aria-label="Settings sections" onkeydown={onNavKey}>
      {#each SECTIONS as s (s.id)}
        <button
          class="nav-item"
          class:active={active === s.id}
          aria-current={active === s.id ? 'page' : undefined}
          disabled={s.soon}
          onclick={() => selectSection(s)}
        >
          <span class="nav-icon"><Icon name={s.icon} size={16} /></span>
          <span class="nav-text">
            <span class="nav-label">{s.label}</span>
            <span class="nav-hint">{s.hint}</span>
          </span>
          {#if s.soon}<span class="soon">Soon</span>{/if}
        </button>
      {/each}
    </nav>

    <section class="panel" aria-label="{active} settings">
      {#if active === 'audio'}
        <header class="panel-head">
          <h3>Audio</h3>
          <p>Sound effects and music play as you explore, fight, and survive. Every cue also has on-screen feedback.</p>
        </header>

        <p class="group-label">Sound effects</p>

        <div class="field">
          <div class="field-text">
            <span class="field-label">Mute sound effects</span>
            <span class="field-desc">Silence every effect. Your choice is remembered.</span>
          </div>
          <button
            class="switch"
            type="button"
            role="switch"
            aria-checked={ui.audioMuted}
            aria-label="Mute sound effects"
            onclick={toggleMute}
          >
            <span class="switch-track"><span class="switch-thumb"></span></span>
            <span class="switch-state">{ui.audioMuted ? 'On' : 'Off'}</span>
          </button>
        </div>

        <div class="field">
          <div class="field-text">
            <span class="field-label">Effects volume</span>
            <span class="field-desc">Overall loudness of sound effects.</span>
          </div>
          <div class="volume">
            <span class="vol-icon"><Icon name={ui.audioMuted ? 'mute' : 'volume'} size={16} /></span>
            <input
              class="slider"
              type="range"
              min="0"
              max="100"
              step="1"
              value={volumePct}
              aria-label="Effects volume"
              aria-valuetext="{volumePct} percent"
              oninput={onVolumeInput}
            />
            <span class="vol-value tnum">{volumePct}%</span>
          </div>
        </div>

        <div class="field">
          <div class="field-text">
            <span class="field-label">Test sound</span>
            <span class="field-desc">Play a sample at the current volume.</span>
          </div>
          <button class="btn" onclick={() => actions.testSound()} disabled={ui.audioMuted}>
            Play sample
          </button>
        </div>

        <p class="group-label">Music</p>

        <div class="field">
          <div class="field-text">
            <span class="field-label">Mute music</span>
            <span class="field-desc">Silence the background score, independent of effects.</span>
          </div>
          <button
            class="switch"
            type="button"
            role="switch"
            aria-checked={ui.musicMuted}
            aria-label="Mute music"
            onclick={toggleMusicMute}
          >
            <span class="switch-track"><span class="switch-thumb"></span></span>
            <span class="switch-state">{ui.musicMuted ? 'On' : 'Off'}</span>
          </button>
        </div>

        <div class="field">
          <div class="field-text">
            <span class="field-label">Music volume</span>
            <span class="field-desc">Loudness of the background score.</span>
          </div>
          <div class="volume">
            <span class="vol-icon"><Icon name={ui.musicMuted ? 'mute' : 'volume'} size={16} /></span>
            <input
              class="slider"
              type="range"
              min="0"
              max="100"
              step="1"
              value={musicVolumePct}
              aria-label="Music volume"
              aria-valuetext="{musicVolumePct} percent"
              oninput={onMusicVolumeInput}
            />
            <span class="vol-value tnum">{musicVolumePct}%</span>
          </div>
        </div>
      {:else if active === 'display'}
        <header class="panel-head">
          <h3>Display</h3>
          <p>How big the dungeon is. Larger boards have more, roomier rooms and render zoomed out, with smaller tiles on screen.</p>
        </header>

        <p class="group-label">Board size</p>

        <div class="field board-field">
          <div class="field-text">
            <span class="field-label">Dungeon size</span>
            <span class="field-desc">Applies when you start a new run — your current dungeon keeps its size.</span>
          </div>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- tabindex -1: the group is not a tab stop itself; focus rovers across
               the radios (tabindex 0/-1 below). Present to satisfy the a11y rule. -->
          <div class="board-options" role="radiogroup" aria-label="Board size" tabindex="-1" onkeydown={onBoardKey}>
            {#each BOARD_OPTIONS as id (id)}
              <button
                class="board-option"
                class:active={ui.boardSize === id}
                type="button"
                role="radio"
                aria-checked={ui.boardSize === id}
                tabindex={ui.boardSize === id ? 0 : -1}
                onclick={() => actions.setBoardSize(id)}
              >
                <span class="board-name">{BOARD_SIZES[id].label}</span>
                <span class="board-dims tnum">{BOARD_SIZES[id].cols}×{BOARD_SIZES[id].rows}</span>
                <span class="board-hint">{BOARD_SIZES[id].hint}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  </div>
</Modal>

<style>
  .settings {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    width: min(92vw, 700px);
    min-height: 380px;
    max-height: 70vh;
  }

  /* --- section nav --- */
  .nav {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border-right: 1px solid var(--border);
    background: var(--surface-rail);
    overflow: auto;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border: 1px solid transparent;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--text-muted);
    text-align: left;
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }
  .nav-item:hover:not(:disabled) {
    background: var(--surface-card);
    color: var(--text-bright);
  }
  .nav-item.active {
    background: var(--surface-card);
    border-color: var(--border-slot);
    color: var(--text-bright);
  }
  .nav-item.active .nav-icon {
    color: var(--accent);
  }
  .nav-item:disabled {
    cursor: default;
    color: var(--text-faint);
  }
  .nav-icon {
    display: flex;
    color: var(--text-label);
  }
  .nav-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    min-width: 0;
  }
  .nav-label {
    font: 600 var(--fs-body) var(--font-display);
    letter-spacing: var(--tracking-tight);
  }
  .nav-hint {
    font: 500 var(--fs-xs) var(--font-ui);
    color: var(--text-dim);
  }
  .soon {
    font: 700 8.5px var(--font-display);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-faint);
    border: 1px solid var(--border-slot);
    border-radius: var(--r-sm, 5px);
    padding: 2px 5px;
  }

  /* --- panel --- */
  .panel {
    padding: 20px 22px;
    overflow: auto;
    background: var(--surface-app);
  }
  .panel-head {
    margin-bottom: 16px;
  }
  .panel-head h3 {
    margin: 0 0 4px;
    font: 600 var(--fs-title) var(--font-display);
    letter-spacing: var(--tracking-tight);
    color: var(--text-bright);
  }
  .panel-head p {
    margin: 0;
    font: 500 var(--fs-xs) var(--font-ui);
    line-height: 1.5;
    color: var(--text-dim);
  }

  .group-label {
    margin: 18px 0 2px;
    font: 700 9px var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-label);
  }
  .group-label:first-of-type {
    margin-top: 4px;
  }
  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px 18px;
    padding: 14px 0;
    border-top: 1px solid var(--border-subtle);
  }
  /* The field right after a group label drops its top divider — the label is
     the separator there. */
  .group-label + .field {
    border-top: none;
    padding-top: 6px;
  }
  .field-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1 1 180px;
  }
  .field-label {
    font: 600 var(--fs-body) var(--font-display);
    color: var(--text-bright);
  }
  .field-desc {
    font: 500 var(--fs-xs) var(--font-ui);
    color: var(--text-dim);
  }

  /* --- switch --- */
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    flex: none;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text-muted);
    font: 600 var(--fs-xs) var(--font-display);
  }
  .switch-track {
    position: relative;
    width: 38px;
    height: 22px;
    border-radius: 999px;
    background: var(--surface-inset);
    border: 1px solid var(--border-slot);
    transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease);
  }
  .switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--text-muted);
    transition: transform var(--dur) var(--ease-spring), background var(--dur) var(--ease);
  }
  .switch[aria-checked='true'] .switch-track {
    background: var(--accent-surface);
    border-color: var(--accent-border);
  }
  .switch[aria-checked='true'] .switch-thumb {
    transform: translateX(16px);
    background: var(--accent);
  }
  .switch-state {
    min-width: 20px;
    text-align: left;
  }

  /* --- volume --- */
  .volume {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1 1 200px;
    max-width: 240px;
  }
  .vol-icon {
    display: flex;
    color: var(--text-label);
  }
  .vol-value {
    min-width: 38px;
    text-align: right;
    font: 600 var(--fs-xs) var(--font-display);
    color: var(--text-muted);
  }
  .slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 999px;
    background: var(--surface-raised);
    cursor: pointer;
  }
  .slider:disabled {
    cursor: default;
  }
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--surface-app);
    box-shadow: 0 0 0 1px var(--accent-border);
    cursor: pointer;
  }
  .slider::-moz-range-thumb {
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--surface-app);
    cursor: pointer;
  }

  /* --- board size picker --- */
  .board-field {
    align-items: flex-start;
  }
  .board-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1 1 280px;
    max-width: 340px;
  }
  .board-option {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 10px;
    padding: 10px 12px;
    border: 1px solid var(--border-slot);
    border-radius: var(--r-md);
    background: var(--surface-inset);
    color: var(--text-muted);
    text-align: left;
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }
  .board-option:hover {
    background: var(--surface-card);
    color: var(--text-bright);
  }
  .board-option.active {
    background: var(--accent-surface);
    border-color: var(--accent-border);
    color: var(--text-bright);
  }
  .board-name {
    font: 600 var(--fs-body) var(--font-display);
    letter-spacing: var(--tracking-tight);
  }
  .board-option.active .board-name {
    color: var(--accent);
  }
  .board-dims {
    align-self: center;
    font: 600 var(--fs-xs) var(--font-display);
    color: var(--text-label);
  }
  .board-hint {
    grid-column: 1 / -1;
    font: 500 var(--fs-xs) var(--font-ui);
    color: var(--text-dim);
  }

  /* --- button --- */
  .btn {
    flex: none;
    min-height: 32px;
    padding: 0 14px;
    border: 1px solid var(--accent-border);
    border-radius: var(--r-md);
    background: var(--accent-surface);
    color: var(--text-bright);
    font: 700 11px var(--font-display);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
  }
  .btn:hover:not(:disabled) {
    background: var(--accent-log-surface);
    border-color: var(--accent);
  }
  .btn:disabled {
    cursor: default;
    color: var(--text-faint);
    border-color: var(--border-slot);
    background: var(--surface-inset);
  }

  @media (max-width: 680px) {
    .settings {
      grid-template-columns: 1fr;
      width: 100%;
      min-height: 0;
      max-height: none;
    }

    .nav {
      flex-direction: row;
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }

    .nav-item {
      min-width: 128px;
    }

    .panel {
      padding: 16px;
    }

    .field {
      align-items: stretch;
    }

    .volume {
      max-width: none;
    }
  }
</style>
