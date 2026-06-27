# Asset Readiness Pipeline Plan

## Purpose

Rogue now ships enough local media that asset readiness needs to become an
explicit design concern. The goal is not a front-loaded loading screen. The game
should stay immediately playable, while likely-needed sounds and images are
quietly made ready before the player reaches them.

This plan proposes a progressive asset readiness pipeline:

1. keep the first playable moment short
2. preload only the small set of assets needed for the current interaction
3. predict near-future assets from game state
4. load expensive or rare assets during idle time
5. keep all asset failures presentation-only, with visual/log feedback intact

No runtime asset generation belongs in this system. The game continues to ship
local files under `public/` and typed registries/manifests in `src/`.

## Current State

### Asset footprint

As of this plan, the major local media groups are roughly:

| Group | Size | Notes |
| --- | ---: | --- |
| `public/endings/` | 49 MB | end-run scenarios and monster-death variants |
| `public/backgrounds/` | 37 MB | floor backgrounds plus legacy pool |
| `public/inventory/` | 18 MB | item, gear, wand, potion, scroll art |
| `public/audio/` | 17 MB | SFX, voice, music |
| `public/chrome-overlays/` | 10 MB | stage/chrome texture overlays |
| `public/bestiary/` | 9 MB | monster portraits |
| `public/intro/` | <1 MB | intro splash |

Total media is about 141 MB across roughly 482 image/audio files (measured at
plan time via `du -sh public/`). That is still manageable, but it is large enough
that "let every `<img>` discover itself on first paint" will eventually produce
visible decode/network hitches.

### Audio

Audio already has the right architectural direction:

- `src/audio/manifest.ts` is a typed sound and music registry.
- `SoundEvent`s are emitted by gameplay and resolved to assets by the audio
  layer.
- `src/audio/service.ts` lazy-unlocks on a trusted gesture.
- core SFX with `preload: true` load after unlock.
- rare SFX lazy-load on first use.
- missing or failed clips warn once and then become silent.
- playback never blocks or throws into gameplay.

Music is separate in `src/audio/music.ts`. It fetches and decodes full tracks
into `AudioBuffer`s, then loops and crossfades them by coarse game-state context.
That works for the current track set, but full-buffer decode is the first audio
area to revisit if tracks become longer, more numerous, or higher quality.

### Images

Images have a strong audit source of truth but no runtime readiness layer:

- `src/assetManifest.ts` derives expected art from the same registries the UI
  renders from.
- `scripts/audit-assets.mjs` and `src/assetManifest.test.ts` keep missing art
  from shipping unnoticed.
- runtime use is mostly direct `<img src="...">` or CSS/background URL usage.
- browser HTTP cache and image cache help, but there is no central way to say
  "load current floor now, next floor soon, endings later."

Important current render paths:

- floor backgrounds: `src/ui/components/CenterStage.svelte`
- background registry: `src/ui/backgrounds.ts`
- inventory art helpers: `src/ui/inventoryArt.ts`
- bestiary portraits: `src/ui/monsterArt.ts` and `MonsterPortrait.svelte`
- end-run art selection: `src/ui/endRunArt.ts` and `EndRunScreen.svelte`
- chrome overlay textures: `src/ui/chromeOverlays.ts`

## Design Principles

### Play first

The app should never require all media to be loaded before accepting input. The
boot path should require only the application shell, current run state, current
floor presentation, and essential control surfaces.

### Load by intent, not by directory

Assets should be grouped by what the player is doing, not by where the files live.
For example, "current floor" can include one background, current floor chrome,
visible monster portraits, and combat SFX. "End-run" can include opening art,
gameover/victory music, and final stats imagery.

### Prefer predictive readiness over loading screens

Rogue has useful game-state signals:

- current floor
- next or previous floor travel
- nearby stairs
- monsters in sight or engaged in combat
- inventory/open modal state
- boss/finale floor
- low health or starvation risk
- run-ending transition

Use those signals to enqueue assets before they are visible.

### Fail soft

No gameplay rule may depend on asset readiness. If an image or sound is missing,
late, or rejected by the browser, the game continues with existing visual/log UI.
Optional presentation can degrade to a color, placeholder, silence, or previous
asset.

### Bound memory

Readiness is not the same as "keep every decoded thing forever." The pipeline
should distinguish:

- URL known
- fetch requested
- image decoded
- currently retained because it is likely to be used
- evicted from JS-owned cache while still possibly held by browser cache

## Asset Priority Model

Add explicit priority tiers to the future runtime manifest/readiness layer.

### `critical-now`

Required for the current view or current interaction.

Examples:

- selected current floor background
- current map chrome textures that are immediately visible
- visible combat portrait
- core SFX: hit, miss, player hit, pickup, stairs
- currently requested music bed, if music is enabled and already unlocked

Behavior:

- enqueue immediately
- load with highest priority
- do not block gameplay, but allow short transition waits where UX benefits
  from doing so, such as floor background crossfade

### `soon`

Likely needed in the next few turns or next UI action.

Examples:

- next floor background candidates when stairs are nearby
- previous floor background when the player can climb back up
- portraits for monsters spawned on the current floor
- inventory art for carried items when inventory has not opened yet
- end-run fallback art when health is critically low

Behavior:

- enqueue after `critical-now`
- use idle slices or low-concurrency background fetch/decode
- safe to cancel or deprioritize when the prediction changes

### `idle`

Nice to have ready eventually, but not part of an immediate transition.

Examples:

- remaining inventory catalogue art
- bestiary portraits for discovered but absent monsters
- chrome overlay textures for future floor bands
- additional current-floor background variants not selected this run

Behavior:

- load only after first paint and input readiness
- throttle aggressively
- pause during combat, modal transitions, floor travel, or low-power conditions

### `rare`

Large or uncommon assets that should usually stay lazy.

Examples:

- all monster-death ending variants
- achievement-style ending variants
- boss/finale-only imagery
- victory credits music
- rare monster-specific death SFX

Behavior:

- lazy-load from concrete prediction or first use
- do not sweep-load entire rare directories
- optionally prefetch a tiny fallback set, not the whole category

## Proposed Architecture

### `AssetReadinessService`

Introduce a small browser-only service that accepts asset requests and manages
priority, concurrency, decode status, and failure state.

Responsibilities:

- enqueue image/audio readiness requests with a priority and reason
- dedupe in-flight work by URL or audio file
- load images with `new Image()`
- call `HTMLImageElement.decode()` when available
- report readiness state for views that want to avoid a visual pop
- keep a bounded decoded-image cache for recently used assets
- warn once for failed optional assets
- never throw into gameplay

This should not replace browser caching. It should give the game a predictable
way to warm the browser cache and image decoder before the UI asks for the asset.

Suggested image states:

| State | Meaning |
| --- | --- |
| `idle` | known but not requested |
| `queued` | scheduled but not started |
| `loading` | fetch/decode in progress |
| `ready` | loaded and decoded successfully |
| `failed` | failed once; do not spam retries |
| `evicted` | removed from JS cache; browser cache may still hold it |

### Runtime load plans

Keep `src/assetManifest.ts` as the source of truth for "what can exist." Add a
runtime-facing layer that turns game state into "what should be warmed now."

This can be a separate module rather than changing the audit manifest directly:

```text
src/assets/
  readiness.ts       # queue/service
  imageLoadPlans.ts  # game state -> AssetRequest[]
  audioLoadPlans.ts  # optional helpers around existing audio manifests
```

The split keeps the audit simple and lets runtime planning evolve without making
every audit entry carry runtime metadata.

### Request shape

Each request should explain why it exists. That makes debugging load behavior
much easier than staring at a queue of URLs.

Recommended fields:

- `kind`: `image | audio`
- `url` or manifest id
- `priority`: `critical-now | soon | idle | rare`
- `reason`: human-readable reason, such as `current-floor-background`
- `owner`: coarse owner, such as `stage`, `inventory`, `bestiary`, `end-run`
- `expiresAtTurn` or cancellation token for predictions that go stale

### Queue behavior

Use a small concurrency limit. For images, start with 2 concurrent loads and tune
from evidence. For audio decode, keep the existing service semantics and avoid
large parallel decode bursts.

The queue should:

- run `critical-now` before `soon`, `soon` before `idle`
- dedupe repeated requests
- support reprioritizing an already queued URL
- pause idle work during active transitions
- expose minimal diagnostics in development builds

Use `requestIdleCallback` when available for idle-tier work, with a `setTimeout`
fallback. Do not rely on idle callbacks for `critical-now` assets.

## Image Loading Strategy

### Current floor background

Today `CenterStage.svelte` swaps `currentBg` and runs a fixed 1000 ms crossfade
(`transitionToBackground`), letting the new `<img>` load mid-fade. The future
behavior should be:

1. choose the next background
2. enqueue it as `critical-now`
3. if it is ready quickly, start the crossfade with the decoded image
4. if it is not ready, keep the current background or floor color until ready
5. after a short cap, continue without blocking gameplay

This avoids a blank or blurry floor transition without adding a loading screen.
Note the readiness wait cap (target <200 ms in the budget table) is a distinct,
shorter timer than the existing 1000 ms crossfade duration: it only gates the
moment the swap begins, not how long the fade itself takes.

### Neighbor floor backgrounds

When stairs are visible or the player is adjacent to stairs:

- enqueue the likely destination floor's selected background as `soon`
- if the run-scoped picker has not picked the target floor yet, either pick and
  commit the selection or enqueue all four variants (`a`/`b`/`c`/`d`) as
  lower-priority `soon`

Prefer committing the run-scoped choice before travel. `createFloorBackgroundPicker`
already memoizes one variant per floor in a `selectedByFloor` map and returns the
cached choice on revisit, so calling `pick(nextFloor)` early is idempotent — it
commits and warms exactly one file without disturbing determinism. Warming one
file beats four. (The current `CenterStage` instance owns one picker per run; the
readiness layer must share that same picker instance, not construct its own, or
the warmed variant can differ from the one rendered.)

### Inventory art

Inventory art becomes visible in bursts when the loadout/inventory UI opens.
Warm it from carried state:

- after the first playable paint, enqueue carried item art as `soon`
- when inventory opens, promote visible rows/cells to `critical-now`
- keep full catalogue art as `idle`, not `critical-now`
- if an item enters inventory, enqueue its art immediately as `soon`

Do not wait for all inventory art before opening the modal. Empty/late cells can
use the existing layout box and fade the image in after decode.

### Monster portraits

Combat portraits are small enough to warm opportunistically:

- enqueue portraits for spawned monsters on the current floor as `soon`
- promote the current combat target portrait to `critical-now`
- enqueue newly discovered bestiary portraits as `idle`

If a portrait is late, the combat UI can show the existing frame/name/HP without
the image and fade in when ready.

### End-run art

End-run art is the largest and least predictable category. Keep it lazy, but use
high-confidence signals:

- if the player dies or wins, enqueue the selected opening art as `critical-now`
- during the death transition, allow a short readiness window before showing the
  art curtain
- if opening art fails, use `pickFallbackEndRunArt()`
- when health is critical, enqueue generic death fallback art as `soon`
- do not preload every monster-death variant

This gives the final moment polish without paying for all possible final moments
at boot.

### Chrome overlays

Chrome textures are medium-size and repeated. They are assigned deterministically
per floor in `CHROME_OVERLAY_FLOOR_ASSIGNMENTS` (one or two layers per floor;
`band` is just a texture category, not a runtime selector). Resolve the current
floor's layers via `chromeOverlaysForFloor(floor)`, warm those as `critical-now`,
warm the next floor's assignment as `soon`, and leave the rest as `idle`.

These textures are consumed as CSS background images — `visualEffects.ts` emits a
`floor-chrome-texture` effect whose `--fx-texture-url: url(...)` custom property is
applied by `EffectLayerHost`. CSS `url()` gives no decode hook, so warming the
same URLs through the readiness service (via `new Image()` + `decode()`) is the
only way to control their decode timing — treat the explicit image request as
required here, not optional.

## Audio Strategy

### SFX

Keep the current SFX model:

- unlock on first trusted input
- preload core SFX after unlock
- lazy-load rare/boss/monster-specific clips
- cap voices and cooldowns
- keep failures silent

Potential improvements:

- add priority to `SoundAsset` only if actual contention appears
- expose a `warmClip(id)` method for prediction without playing
- warm likely next clips from events, such as stairs nearby or inventory open
- avoid decoding all monster-specific death clips up front

### Music

The current `MusicService` decodes full tracks into memory. That gives tight
Web Audio control but can become expensive as the music catalogue grows.

Future decision point:

- keep Web Audio buffers for short beds and precise crossfade control
- switch long music beds to `HTMLAudioElement` or `MediaElementAudioSourceNode`
  when memory/decode cost is more important than exact buffer control
- consider Opus/WebM for music if browser support and asset pipeline allow it

Music should stay lazy and context-based:

- no music blocks first input
- no music blocks first SFX
- load the desired context after unlock
- prefetch likely next context only for strong signals, such as floor depth band
  changes or entering the boss/finale phase

## Asset Format And Size Plan

Before adding complex scheduling, reduce unnecessary bytes.

### Generated images

Evaluate WebP or AVIF for generated art:

- backgrounds
- endings
- inventory art
- bestiary portraits
- chrome overlays

Recommended approach:

1. convert a representative sample of each category
2. compare visual quality in-game, not only file size
3. measure decode time on desktop and a lower-powered laptop/phone
4. keep source generation docs unchanged unless the production format changes
5. update audit tests to accept the chosen extension strategy

Do not convert everything blindly. Some art may contain texture/noise where WebP
quality settings need tuning.

### Thumbnails

Some views do not need full-size art:

- inventory cells
- bestiary list previews
- ending history thumbnails, if added later

If these surfaces grow, generate thumbnail variants instead of asking CSS to
downscale large images repeatedly.

Possible layout:

```text
public/inventory/thumbs/<asset>.webp
public/bestiary/thumbs/<monster>.webp
public/endings/thumbs/<ending>.webp
```

Only add thumbnails where profiling shows benefit.

## Browser Cache And Offline Strategy

### Near term

Rely on normal HTTP/browser cache. The readiness service should warm cache by
requesting assets at the right time, not build its own persistent storage layer.

### Later

If Rogue becomes installable/offline-capable, add a service worker with cache
groups:

- app shell and critical UI
- current release's core SFX
- generated art by category
- rare art lazy-cached after first use

Use versioned cache names or manifest hashes so old generated art does not stick
around after file renames.

Do not start with a service worker unless the game needs offline support or
repeat-load performance becomes a measured problem. Service workers add stale
asset failure modes that are harder to debug than ordinary browser cache.

## Implementation Phases

### Phase 1: Instrument and baseline

Goal: know where asset delay actually hurts.

Tasks:

- add lightweight development-only timing around image decode and audio decode
- log slow assets by URL/id, category, size if available, and owner
- measure first playable time, first floor transition, inventory open, combat
  portrait reveal, and end-run reveal
- document target budgets

Suggested starting budgets:

| Interaction | Target |
| --- | ---: |
| first playable input | no media-wide block |
| floor background transition | no blank frame; prefer <200 ms wait cap |
| inventory open | modal opens immediately |
| combat portrait | frame/name immediate; image ready or fades in |
| end-run opener | tolerate short dramatic delay, but no indefinite wait |

### Phase 2: Image readiness service

Goal: centralize image warming without changing gameplay semantics.

Tasks:

- add `AssetReadinessService`
- support image queue, dedupe, priority, decode, failure state
- add unit tests with mocked image/decode behavior
- add development diagnostics for queue contents and failures
- keep the service inert in SSR/tests where browser image APIs are unavailable

### Phase 3: Current and next floor backgrounds

Goal: remove the most visible first-use image risk.

Tasks:

- warm current background on stage mount
- warm next/previous floor background from stair proximity/travel intent
- adjust floor transition to prefer decoded images when available
- keep a short cap so travel never feels blocked
- verify reduced-motion behavior is unchanged

### Phase 4: Inventory and monster portraits

Goal: warm high-frequency modal/combat art.

Tasks:

- enqueue carried item art after first paint and on pickup
- promote visible inventory items when the modal opens
- enqueue current-floor monster portraits
- promote combat target portrait on engagement
- fade in late images without layout shift

### Phase 5: End-run and rare assets

Goal: polish final moments without sweeping all ending art.

Tasks:

- warm selected opening end-run art during run-finalization/death handoff
- use fallback art when selected art fails
- optionally warm generic death art when HP is critical
- keep monster-specific death variants lazy until selected

### Phase 6: Formats, thumbnails, and cache policy

Goal: reduce pressure before adding more scheduler complexity.

Tasks:

- run category-by-category image format experiments
- decide PNG/WebP/AVIF policy
- add thumbnail variants only where useful
- update asset audit to understand any new production extension/layout
- consider service worker only if repeat-load/offline goals justify it

## Integration Points

### `src/assetManifest.ts`

Keep this as the audit source of truth. Add runtime metadata only if it stays
simple and broadly true. Otherwise derive runtime load plans in a separate
module from the same registries.

### `src/audio/manifest.ts`

Keep audio event resolution here. If needed, add explicit warm/preload helpers
to the audio services rather than letting UI code name audio filenames.

### `src/ui/components/CenterStage.svelte`

Primary integration point for current and next floor background readiness.
Floor travel is the most visible place to prove the pattern.

### `src/ui/components/InventoryModal.svelte`

Promote visible carried-item art to `critical-now` when inventory opens. Keep
modal layout stable even when images are still decoding.

### `src/ui/components/MonsterPortrait.svelte`

Use readiness state only for presentation. The combat portrait frame, name, and
HP indicator should render even if the image is late.

### `src/ui/components/EndRunScreen.svelte`

Use selected art readiness and fallback art readiness during the opening curtain.
Do not wait for all possible endings. Fallback selection already exists as
`pickFallbackEndRunArt(summary)` in `src/ui/endRunArt.ts`.

### `src/ui/visualEffects.ts` and `EffectLayerHost.svelte`

Chrome overlay textures are resolved per floor here (`chromeOverlaysForFloor`) and
surfaced as CSS `url()` custom properties. This is the integration point for
warming overlay decode ahead of a floor change, since the CSS path offers no
decode hook of its own.

## Testing And Verification

### Unit tests

- queue dedupes repeated image requests
- higher priority request promotes an already queued URL
- failed assets warn once and settle to `failed`
- decode success settles to `ready`
- missing browser APIs produce no-op behavior
- stale predictions can be canceled or ignored

### Component tests

- floor transition renders without blanking when next background is late
- inventory opens before all item images are ready
- combat portrait renders frame/name/HP while image is late
- end-run art falls back when selected art fails

### Browser verification

Use throttled network and disabled cache to verify:

- first playable input is not delayed by the full media catalogue
- floor travel does not flash blank background
- opening inventory does not shift layout as images arrive
- combat portrait image fade-in does not cover gameplay controls
- end-run curtain never hangs indefinitely

### Asset audit

Keep the existing audit behavior:

- missing required files fail tests
- optional/legacy files remain non-blocking
- new asset categories are registered from source-of-truth data

If alternate formats or thumbnails are added, extend the audit rather than
creating a second unsynchronized file list.

## Non-Goals

- no runtime calls to image, music, voice, or SFX generation APIs
- no mandatory full-game loading screen at boot
- no requirement that all assets load before play
- no gameplay rules gated on asset readiness
- no service worker in the first implementation slice
- no mass preload of all endings, all backgrounds, or all monster death cues

## Open Decisions

1. Should `src/assetManifest.ts` carry runtime priority hints, or should runtime
   load plans stay separate and derive from registries?
2. Should floor background selection for the next floor be committed before
   travel when stairs are nearby, or should all variants be warmed at lower
   priority? (Leaning commit-before-travel: `createFloorBackgroundPicker`
   memoizes per floor, so an early `pick(nextFloor)` is deterministic and warms
   one file instead of four — provided the readiness layer reuses `CenterStage`'s
   picker instance rather than creating its own.)
3. What image format policy should generated art use: PNG only, WebP primary
   with PNG fallback, or AVIF/WebP by category?
4. When does music move from full `AudioBuffer` decode to streaming media
   elements?
5. Should a developer-only asset readiness overlay be added, or are console
   diagnostics enough?

## Recommended First Slice

Build the first implementation around floor backgrounds only:

1. add image readiness service
2. warm current floor background
3. warm likely next floor background when stairs are known
4. gate the crossfade on decoded readiness with a short timeout
5. verify throttled-network behavior

That slice proves the architecture at the highest-visibility point without
touching the larger inventory, end-run, or audio surfaces.
