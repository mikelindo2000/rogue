<script lang="ts">
  import type { MonsterTemplate } from '../../types';
  import { MONSTER_DATABASE } from '../../config';
  import { ui, actions } from '../store.svelte';
  import { monsterId, tierOf } from '../../discovery';
  import Modal from './primitives/Modal.svelte';
  import MonsterCard from './MonsterCard.svelte';
  import MonsterDetail from './MonsterDetail.svelte';

  let query = $state('');
  let detail = $state<MonsterTemplate | null>(null);

  // Tag every template with its discovery state for the current snapshot.
  const entries = $derived(
    MONSTER_DATABASE.map((monster) => {
      const id = monsterId(monster);
      return {
        monster,
        id,
        tier: tierOf(ui.discovery, id),
        firstSeenFloor: ui.discovery.firstSeenFloor[id],
        killCount: ui.discovery.killCount[id] ?? 0,
      };
    }),
  );

  const discoveredCount = $derived(
    entries.filter((e) => e.tier !== 'unknown').length,
  );

  // Empty query shows the whole bestiary (silhouettes included) so the player
  // sees how much remains. A query can only match monsters they've discovered —
  // you can't search for a name you've never learned.
  const filtered = $derived.by(() => {
    const q = query.toLowerCase().trim();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.tier !== 'unknown' &&
        (e.monster.name.toLowerCase().includes(q) ||
          e.monster.symbol.toLowerCase().includes(q)),
    );
  });

  function close() {
    detail = null;
    actions.setCompendiumOpen(false);
  }

  function detailKillCount(): number {
    if (!detail) return 0;
    return ui.discovery.killCount[monsterId(detail)] ?? 0;
  }
  function detailFirstSeen(): number | undefined {
    if (!detail) return undefined;
    return ui.discovery.firstSeenFloor[monsterId(detail)];
  }
</script>

<Modal open={ui.compendiumOpen} title="Bestiary" onClose={close}>
  <div class="body">
    <div class="search">
      <input
        type="text"
        bind:value={query}
        placeholder="Search discovered monsters…"
        autocomplete="off"
        spellcheck="false"
        aria-label="Search monsters"
      />
      <span class="count">{discoveredCount} / {entries.length} discovered</span>
    </div>

    {#if filtered.length === 0}
      <p class="empty">
        {query.trim() ? 'No discovered monsters match.' : 'No monsters in the bestiary.'}
      </p>
    {:else}
      <div class="grid">
        {#each filtered as entry (entry.id)}
          <MonsterCard
            monster={entry.monster}
            tier={entry.tier}
            firstSeenFloor={entry.firstSeenFloor}
            killCount={entry.killCount}
            onView={() => (detail = entry.monster)}
          />
        {/each}
      </div>
    {/if}
  </div>
</Modal>

<MonsterDetail
  monster={detail}
  killCount={detailKillCount()}
  firstSeenFloor={detailFirstSeen()}
  onClose={() => (detail = null)}
/>

<style>
  .body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 18px;
    width: min(78vw, 880px);
  }

  .search {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .search input {
    flex: 1;
    min-width: 0;
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
  .count {
    flex: none;
    font: 600 var(--fs-sm) var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
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

  @media (max-width: 680px) {
    .body {
      width: 100%;
      padding: 12px;
    }

    .search {
      align-items: stretch;
      flex-direction: column;
      gap: 8px;
    }

    .count {
      white-space: normal;
      letter-spacing: 0.08em;
    }

    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
