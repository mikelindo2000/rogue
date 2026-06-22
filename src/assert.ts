/**
 * Tiny invariant helpers. The philosophy: a violated invariant is a bug, so
 * surface it loudly and immediately instead of letting a corrupt game state
 * propagate into a mysterious crash later.
 */

/** Throws when `condition` is falsy. For cheap checks that must always hold. */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invariant violated: ${message}`);
  }
}

/**
 * Like `assert`, but only runs during development and tests (Vite/Vitest set
 * `import.meta.env.DEV`). Use for deeper/expensive checks that we don't want to
 * risk throwing inside a player's production session — the thunk isn't even
 * evaluated in a production build.
 */
export function devAssert(check: () => boolean, message: string): void {
  const env = (import.meta as { env?: { DEV?: boolean } }).env;
  if (env?.DEV && !check()) {
    throw new Error(`Invariant violated (dev): ${message}`);
  }
}
