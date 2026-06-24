import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // The svelte plugin lets component tests (e.g. InventoryModal.test.ts) import
  // and mount `.svelte` files. It only transforms `.svelte` modules, so it is
  // inert for the DOM-free logic tests.
  plugins: [svelte()],
  test: {
    // The game logic under test (rng, map, combat, items, leveling) is
    // DOM-free, so the fast Node environment is the default. Component tests
    // opt into a DOM with a `// @vitest-environment happy-dom` file docblock.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    // Resolve Svelte's browser/client entry so mount() drives a real (happy-dom)
    // DOM in component tests. Harmless for node tests (they import no .svelte).
    conditions: ['browser'],
  },
});
