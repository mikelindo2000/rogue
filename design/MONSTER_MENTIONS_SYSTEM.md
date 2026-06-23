# Monster Mentions System

Monster identity should be visible anywhere prose names a monster. The readable
name stays in the text, but it is preceded by the same in-game glyph and color
so combat logs, bestiary copy, inventory effects, and future tooltips all scan
like the dungeon board.

## Goals

- Preserve prose legibility: monster names remain normal text, and glyphs use
  `em` sizing so they follow the surrounding line height.
- Use one shared visual language across logs and Svelte components.
- Keep engine logs readable as plain text while allowing the UI layer to enrich
  known monster names.
- Prefer stable monster data from `MONSTER_DATABASE` and runtime monster fields:
  `id`, `name`, `symbol`, `color`, and `special`.

## Building Blocks

- `src/ui/monsterMention.ts` owns the view model and HTML enrichment helpers.
- `src/ui/components/MonsterMention.svelte` is the structured Svelte component
  for bestiary, inventory, tooltip, and modal text.
- `.monster-mention*` rules in `src/ui/styles/global.css` are shared by both the
  Svelte component and the message-log HTML path.

The common shape is:

```ts
interface MonsterMentionView {
  id: string;
  name: string;
  glyph: string;
  color: string;
  boss: boolean;
}
```

## Usage

Use the Svelte component when code already has a monster object:

```svelte
<MonsterMention monster={monster} />
```

Use the enrichment helper only at string boundaries, such as the current message
log bridge:

```ts
const html = enrichMonsterMentionsHtml(logText);
```

The helper matches known monster names case-insensitively, sorted longest first,
so `Dragon King` is not partially rendered as `Dragon`. It also escapes ordinary
text before inserting mention markup, while preserving the existing trusted item
name spans used by loot messages.

## Presentation Rules

- Inline/log mentions are not pill buttons. The container is inline text, and
  only the glyph is boxed, keeping wrapping and line rhythm natural.
- The glyph uses `var(--monster-color)` and `var(--font-mono)` to stay close to
  the board identity without requiring a canvas render.
- Boss mentions use the same shape with a stronger border/glow treatment.
- Future dense surfaces can tune the glyph size locally by overriding
  `.monster-mention__glyph` inside the component scope.

## Keyboard And Accessibility

Mentions are informational, not controls, so they do not enter the tab order.
If a future mention opens a bestiary detail, wrap it in a real `<button>` and
keep Return/Space activation plus visible focus in that owning component.
