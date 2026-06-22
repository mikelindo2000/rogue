# Agent Guidelines

## Keyboard-First Gameplay

Rogue must be fully playable from the keyboard, in the spirit of the original Rogue. Every gameplay feature, modal, menu, picker, overlay, and repeated UI control needs keyboard parity with pointer controls before it is considered complete.

- Keep global game shortcuts active only in the appropriate gameplay context.
- Scope modal and overlay shortcuts to the active modal so they do not leak into movement or other global actions.
- Make arrow keys navigate selectable lists, grids, menus, and action groups.
- Make Return activate the focused or selected command.
- Add mnemonic shortcuts where they match Rogue-style verbs, such as `e` for equip, without breaking existing global shortcuts.
- Preserve focus visibly and predictably after opening, closing, changing selection, or performing an action.
- Include keyboard behavior in verification for any UI or gameplay feature.
