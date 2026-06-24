# Intro Screen, How-to-Play & Shortcuts Plan

## Purpose

Right now the game has no front door. On load, `main.ts` restores or starts a run
and drops the player straight onto floor 1 — a first-time visitor gets no
objective, no controls, and no framing. Meanwhile the end-of-run screen is rich
and polished. This plan adds a **new-game intro screen** that:

1. Greets a first-time player with a short, in-voice **How to Play** guide.
2. Points them at the keyboard shortcuts — and **fixes the `?` "all shortcuts"
   affordance, which is currently fake** (the hint renders but nothing is wired).
3. **Shares its How-to-Play content with the end screen** as a new tab, so the
   guide is reachable again after the intro is gone.
4. Can read the guide aloud in a suitably ominous voice via a pre-generated
   ElevenLabs narration clip, triggered by a button.

## Decisions Resolved (locked with product)

- **D1 — Intro model: "Enter the dungeon" gate.** The intro is a full-surface
  `role="dialog"` shown over the board *before* play. One click/keypress dismisses
  it. The dismissing gesture also satisfies the browser autoplay unlock. Game
  input does not run underneath while the gate is open.
- **D2 — Shown on first visit only.** The intro auto-shows only when there is **no
  prior save** *and* a persisted `introSeen` flag is unset. After death,
  **Restart goes straight into play** — the guide lives on as a tab in the end
  screen, so we never nag returning players. No "don't show again" checkbox is
  needed (it would be redundant with first-visit-only).
- **D3 — Narration: pre-generated, committed, play-on-button.** A scary VO clip is
  generated once via ElevenLabs (key from `~/.secrets`), saved under
  `public/audio/`, and registered in the audio manifest. It plays **only** when
  the player presses a speaker/"hear the warning" button — never automatically.
  No API key ships in the browser.

## Current State

- **No menu/intro state.** Screens are driven by two booleans, `gameOver` /
  `gameWon`, in `src/ui/store.svelte.ts`. `src/main.ts` (DOMContentLoaded) mounts
  `App.svelte`, restores or `initGame()`s, and calls `engine.draw()`.
- **End screen** is `src/ui/components/EndRunScreen.svelte` — a `role="dialog"`
  with a tab bar (`story | combat | loot | exploration | records | history |
  credits`, defined at lines 9-17) and its own keydown handler (lines 94-130).
  It opens when `!!summary && (ui.gameOver || ui.gameWon)`.
- **The `?` shortcuts button is non-functional.** `src/ui/components/Footer.svelte`
  lines 56-59 render `<KeyCap>?</KeyCap> all shortcuts` as a plain `<span>` — no
  click handler. There is no `?` keybinding, no `shortcutsOpen` state, and no
  shortcuts modal component.
- **Keybindings are centralized but not introspectable.** All bindings register in
  `src/main.ts` (~lines 310-478) via `keyboard.register({ keys, description,
  context, callback })` on the `KeyboardManager` (`src/keyboard.ts`). The manager
  holds them but exposes no list accessor today.
- **Audio is a static manifest.** `src/audio/manifest.ts` maps ids → files under
  `public/audio/`; the service plays `SoundEvent`s. The manifest header documents
  that ElevenLabs prompts are authored offline, never called at runtime.
- **Persistence helpers** follow a consistent module pattern: `persistence/
  settings.ts` (prefs), `persistence/runHistory.ts`, `persistence/savegame.ts`.

## Proposed UX

### The intro gate

A dark, full-surface overlay over the (already-initialized) board:

- **Title block** — game name + one-line hook ("Descend. Take the Amulet of
  Ballard. Escape alive. Almost no one does.").
- **`<HowToPlay />`** — the shared guide (see below).
- **Primary action** — a big **"Enter the dungeon"** button (also bound to
  `Enter` / `Space`). Dismisses the gate, marks `introSeen`, unlocks audio.
- **Secondary action** — a **🔊 "Hear the warning"** speaker button that plays the
  narration clip (D3). Pressing it is itself a user gesture, so it works before
  the player enters.

While open it is `role="dialog"` so existing overlay-suppression
(`overlayOpen()` in `main.ts:148`, which matches `[role="dialog"]`) blocks
movement underneath. **Verify** during implementation that every keybinding path
(not just `moveOrAim`) respects the gate — some callbacks (`m`, `,`) call engine
methods directly; gate them on `!ui.introOpen` or on `overlayOpen()`.

### Shared How-to-Play content

A new presentational component `src/ui/components/HowToPlay.svelte` is the single
source of guide copy, embedded in **two** hosts:

1. The intro gate.
2. A new **"How to Play"** tab in `EndRunScreen.svelte`.

Content (concise, scannable, in-world voice):

- **Goal** — descend the dungeon, claim the Amulet of Ballard, then climb back to
  floor 1 to win. Death is permanent.
- **Core loop** — move with arrows/WASD; bump enemies to fight; manage hunger by
  eating; use potions/scrolls/wands; find the down-stairs.
- **A handful of key actions** — a small curated grid (move, run, inventory, eat,
  quaff, read, search, bestiary) rendered with `KeyCap`.
- **Pointer to the full list** — "Press `?` any time for every shortcut." On
  desktop this `?` is a live button (see below).

To keep the curated key hints from drifting, derive them from the same published
binding list the shortcuts modal uses (see next), filtered to a featured subset.

### Fixing `?` / the shortcuts modal

- Add `shortcutsOpen: boolean` to `UIState` and `setShortcutsOpen(open)` to
  actions.
- New `src/ui/components/ShortcutsModal.svelte` built on `primitives/Modal`,
  listing **every** binding grouped/labeled by context (`game`, `aiming`), each
  row = `KeyCap`(s) + description.
- **Single source of truth.** Add `KeyboardManager.list()` returning
  `{ keys, description, context }[]`. After all `register()` calls in `main.ts`,
  publish into the store: `ui.shortcuts = keyboard.list()`. The modal and the
  HowToPlay featured subset both read `ui.shortcuts` — no hand-maintained
  duplicate of the key list.
- Register a `?` binding in `main.ts` (`keys: ['?']`, context `game`) that toggles
  `shortcutsOpen`; close on `?` or `Escape` from inside the modal. `?` is
  `Shift+/`; confirm `KeyboardManager` matches on the resolved `e.key === '?'`.
- Make the Footer hint real: convert the `span.hint.right` (Footer.svelte:56-59)
  into a `<button>` calling `actions.setShortcutsOpen(true)` so mouse users — the
  literal "doesn't work at all" complaint — can open it too.

### Narration

- **Generate once** with the ElevenLabs text-to-speech skill using the key in
  `~/.secrets`. Pick a deep/menacing preset voice; document voice id + settings +
  the exact script in `design/implemented/` (alongside the existing
  `sound_effect_asset_prompts.md`) so it's reproducible.
- Save to e.g. `public/audio/voice/intro-warning-01.mp3` and register in
  `SOUND_ASSETS` (channel `ui`, `preload: false`, modest `volume`).
- **Playback:** add a minimal "play asset by id" path to the audio service (or, if
  simpler, a guarded one-shot `HTMLAudioElement` that respects `ui.audioMuted`),
  invoked by the speaker button. It is a standalone VO, not an event cue, so it
  does not need a `SoundEvent` entry. Provide stop/replay on the same button.
- **Script (draft, to be refined):** a short, ominous welcome that states the
  goal and dares the player to descend — ~15-25s. Final text lives in the design
  doc and is mirrored as the on-screen guide's framing line.

## Technical Changes

| Area | Change |
| --- | --- |
| `src/ui/store.svelte.ts` | Add `introOpen`, `shortcutsOpen`, `shortcuts: ShortcutInfo[]`; actions `dismissIntro()`, `setShortcutsOpen()`. |
| `src/persistence/intro.ts` (new) | `getIntroSeen()` / `setIntroSeen()` over a dedicated localStorage key, mirroring `runHistory.ts`. (Alternatively a field on `settings.ts` — pick one; standalone keeps prefs clean.) |
| `src/keyboard.ts` | Add `list()` accessor exposing registered bindings. |
| `src/main.ts` | Compute `shouldShowIntro(save, introSeen)` (pure, testable) and set `ui.introOpen`; register `?` binding; publish `ui.shortcuts = keyboard.list()`; ensure all input paths respect the gate. |
| `src/ui/components/HowToPlay.svelte` (new) | Shared guide content. |
| `src/ui/components/IntroScreen.svelte` (new) | The gate dialog: HowToPlay + Enter + narration button. |
| `src/ui/components/ShortcutsModal.svelte` (new) | Full binding list from `ui.shortcuts`. |
| `src/ui/components/EndRunScreen.svelte` | Add `howto` tab → `<HowToPlay />`. |
| `src/ui/components/Footer.svelte` | Make the `?` hint a real button. |
| `src/ui/App.svelte` | Render `<IntroScreen />` (when `ui.introOpen`) and `<ShortcutsModal />`. |
| `src/audio/manifest.ts` + `public/audio/voice/` | New narration asset. |

## Testing

- **Unit:** `shouldShowIntro(save, introSeen)` truth table; `getIntroSeen/
  setIntroSeen` round-trip; `KeyboardManager.list()` returns registered bindings.
- **Component:** HowToPlay renders goal + featured keys; ShortcutsModal renders a
  row per binding from a provided list; dismissing the intro flips `introOpen` and
  persists `introSeen`.
- **Manual/verify:** first load (cleared storage) shows the gate; Enter dismisses
  and grants control; reload does **not** re-show; movement is dead while the gate
  is open; `?` (key and Footer button) opens the modal in-game; the end-screen
  "How to Play" tab matches the intro; narration plays on button only.

## Suggested Implementation Slices

1. **Shortcuts modal + real `?`.** `KeyboardManager.list()`, publish to store, `?`
   binding, `ShortcutsModal.svelte`, Footer button. Self-contained; fixes a live
   bug independent of everything else.
2. **Shared HowToPlay + end-screen tab.** Add the component and wire the new tab.
3. **Intro gate + persistence + main.ts wiring.** `introSeen`, `shouldShowIntro`,
   `IntroScreen.svelte`, App render, input suppression verification.
4. **Narration.** Generate/commit the clip, manifest entry, play-on-button.

## Deferred / Open

- **Mobile shortcuts affordance.** Desktop gets the Footer `?` button; the
  keyboard-shortcuts list is less relevant on touch. HowToPlay (via intro + death
  tab) already covers mobile; a small TopBar "?" help button is optional.
- **Replaying the intro on demand** from settings (a "view intro again" link)
  could be added later; the death-screen tab covers the immediate need.
- **Narration auto-play** was explicitly declined for now (button only); revisit
  if desired once the gate UX feels right.
