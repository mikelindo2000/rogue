<script lang="ts">
  import TopBar from './components/TopBar.svelte';
  import CharacterCard from './components/CharacterCard.svelte';
  import Vitals from './components/Vitals.svelte';
  import Equipment from './components/Equipment.svelte';
  import Consumables from './components/Consumables.svelte';
  import CenterStage from './components/CenterStage.svelte';
  import Inventory from './components/Inventory.svelte';
  import MessageLog from './components/MessageLog.svelte';
  import Footer from './components/Footer.svelte';
  import Compendium from './components/Compendium.svelte';
  import InventoryModal from './components/InventoryModal.svelte';
  import BalancePanel from './components/BalancePanel.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
</script>

<div class="frame">
  <TopBar />
  <div class="body">
    <aside class="rail rail-left">
      <CharacterCard />
      <Vitals />
      <Equipment />
      <Consumables />
    </aside>
    <CenterStage />
    <aside class="rail rail-right">
      <Inventory />
      <MessageLog />
    </aside>
  </div>
  <Footer />
</div>

<Compendium />
<InventoryModal />
<BalancePanel />
<SettingsModal />

<style>
  .frame {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    background: var(--surface-app);
    color: var(--text-bright);
    overflow: hidden;
  }
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .rail {
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--surface-rail);
  }
  .rail-left {
    width: var(--rail-left-w);
    border-right: 1px solid var(--border);
  }
  .rail-right {
    width: var(--rail-right-w);
    border-left: 1px solid var(--border);
  }

  @media (max-width: 860px) {
    .frame {
      overflow: hidden;
    }

    .body {
      flex-direction: column;
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }

    .body :global(.stage) {
      order: 1;
      flex: none;
      min-height: min(58vh, 480px);
      height: min(58vh, 480px);
      border-bottom: 1px solid var(--border);
    }

    .rail {
      width: 100%;
      min-height: auto;
      border-left: 0;
      border-right: 0;
    }

    .rail-left {
      order: 2;
      border-bottom: 1px solid var(--border);
    }

    .rail-right {
      order: 3;
    }

    .rail-left :global(.equipment) {
      flex: none;
    }

    .rail-left :global(.equipment .list) {
      max-height: 280px;
    }

    .rail-right :global(.log) {
      min-height: 180px;
      max-height: 240px;
      border-top: 1px solid var(--border-subtle);
    }
  }

  @media (max-width: 560px) {
    .body :global(.stage) {
      min-height: 360px;
      height: 46vh;
    }

    .rail-left :global(.card),
    .rail-left :global(.vitals) {
      padding-inline: 12px;
    }

    .rail-left :global(.consumables) {
      display: none;
    }
  }
</style>
