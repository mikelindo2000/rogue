import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Two projects keep concerns scoped:
//  - "logic": the DOM-free game-logic suites on the fast Node environment, with
//    default module resolution.
//  - "components": Svelte component tests on happy-dom. Only this project resolves
//    Svelte's browser/client entry (so mount() works), so the `browser` condition
//    can never alter how the Node logic tests resolve a future dependency.
export default defineConfig({
  plugins: [svelte()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'logic',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/ui/components/**/*.test.ts'],
        },
      },
      {
        extends: true,
        resolve: { conditions: ['browser'] },
        test: {
          name: 'components',
          environment: 'happy-dom',
          include: ['src/ui/components/**/*.test.ts'],
        },
      },
    ],
  },
});
