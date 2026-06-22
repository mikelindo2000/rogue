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

<style>
  .frame {
    display: flex;
    flex-direction: column;
    height: 100vh;
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
</style>
