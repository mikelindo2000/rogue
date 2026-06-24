import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Port is env-overridable so multiple git worktrees can each run a dev server
// without colliding (the default 3000 + strictPort would otherwise fail the
// second one). `scripts/worktree-dev.sh` picks a free PORT; a bare
// `npm run dev` still uses 3000. See WORKTREES.md.
const port = Number(process.env.PORT ?? process.env.VITE_PORT ?? 3000);

export default defineConfig({
  plugins: [svelte()],
  server: {
    port,
    strictPort: true
  }
});
