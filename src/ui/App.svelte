<script lang="ts">
  import TopBar from './components/TopBar.svelte';
  import CharacterCard from './components/CharacterCard.svelte';
  import Vitals from './components/Vitals.svelte';
  import Equipment from './components/Equipment.svelte';
  import ReadiedWand from './components/ReadiedWand.svelte';
  import Consumables from './components/Consumables.svelte';
  import CenterStage from './components/CenterStage.svelte';
  import Inventory from './components/Inventory.svelte';
  import MessageLog from './components/MessageLog.svelte';
  import Footer from './components/Footer.svelte';
  import Compendium from './components/Compendium.svelte';
  import InventoryModal from './components/InventoryModal.svelte';
  import DebugPanel from './components/DebugPanel.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import ShortcutsModal from './components/ShortcutsModal.svelte';
  import IntroScreen from './components/IntroScreen.svelte';
  import EffectLayerHost from './components/EffectLayerHost.svelte';
  import { ui } from './store.svelte';
</script>

<div class="frame">
  <div class="shell">
    <TopBar />
    <div class="body">
      <aside class="rail rail-left">
        <EffectLayerHost effects={ui.visualEffects} target="chrome" />
        <div class="rail-content">
          <CharacterCard />
          <Vitals />
          <Equipment />
          <ReadiedWand />
          <Consumables />
        </div>
      </aside>
      <CenterStage />
      <aside class="rail rail-right">
        <EffectLayerHost effects={ui.visualEffects} target="chrome" />
        <div class="rail-content">
          <Inventory />
          <MessageLog />
        </div>
      </aside>
    </div>
    <Footer />
  </div>
</div>

<Compendium />
<InventoryModal />
<DebugPanel />
<SettingsModal />
<ShortcutsModal />
<IntroScreen />

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
  .shell {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
  }
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .rail {
    position: relative;
    /* Contain chrome-fog z-index math so it can't leak into the app stack
       (the host self-clips via overflow: hidden, so the rail keeps overflow
       visible and focus rings/tooltips are never clipped). z-index lifts the
       whole rail above the stage's canvas (z1) and overlay effects (z2) so
       leftward-overhanging popovers — e.g. the inventory tooltip — still render
       over the board, while staying below the end-run overlay (z8). */
    isolation: isolate;
    z-index: 3;
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--surface-rail);
  }
  /* Holds the rail's real content above the chrome effect host (z-index: 0). */
  .rail-content {
    position: relative;
    z-index: 1;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
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
