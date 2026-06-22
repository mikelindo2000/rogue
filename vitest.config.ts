import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The game logic under test (rng, map, combat, items, leveling) is
    // DOM-free, so the fast Node environment is all we need.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
