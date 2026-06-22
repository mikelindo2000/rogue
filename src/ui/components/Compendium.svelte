<script lang="ts">
  import { MONSTER_DATABASE } from '../../config';
  import { ui, actions } from '../store.svelte';
  import Modal from './primitives/Modal.svelte';
  import MonsterCard from './MonsterCard.svelte';

  let query = $state('');

  const filtered = $derived.by(() => {
    const q = query.toLowerCase().trim();
    if (!q) return MONSTER_DATABASE;
    return MONSTER_DATABASE.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.symbol.toLowerCase().includes(q),
    );
  });

  function close() {
    actions.setCompendiumOpen(false);
  }
</script>

<Modal open={ui.compendiumOpen} title="Bestiary" onClose={close}>
  <div class="body">
    <div class="search">
      <input
        type="text"
        bind:value={query}
        placeholder="Search by name or symbol…"
        autocomplete="off"
        spellcheck="false"
        aria-label="Search monsters"
      />
    </div>

    {#if filtered.length === 0}
      <p class="empty">No monsters found.</p>
    {:else}
      <div class="grid">
        {#each filtered as monster (monster.name)}
          <MonsterCard {monster} />
        {/each}
      </div>
    {/if}
  </div>
</Modal>

<style>
  .body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 18px;
    width: min(78vw, 880px);
  }

  .search input {
    width: 100%;
    box-sizing: border-box;
    padding: 11px 14px;
    background: var(--surface-inset-2);
    border: 1px solid var(--border-slot);
    border-radius: var(--r-md);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
    color: var(--text-bright);
    font: 500 var(--fs-value) var(--font-ui);
    outline: none;
    transition:
      border-color var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease);
  }
  .search input::placeholder {
    color: var(--text-dim);
  }
  .search input:focus {
    border-color: var(--accent-border);
    box-shadow:
      inset 0 1px 3px rgba(0, 0, 0, 0.5),
      0 0 0 2px var(--accent-surface);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
  }

  .empty {
    margin: 0;
    padding: 32px 0;
    text-align: center;
    font: 500 var(--fs-body) var(--font-ui);
    color: var(--text-dim);
  }
</style>
