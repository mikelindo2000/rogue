<script lang="ts">
  import type { Monster, MonsterTemplate } from '../../types';
  import { monsterMentionView, type MonsterMentionView } from '../monsterMention';

  let {
    monster,
    mention,
    variant = 'inline',
    label,
  }: {
    monster?: Monster | MonsterTemplate;
    mention?: MonsterMentionView;
    variant?: 'inline' | 'log';
    label?: string;
  } = $props();

  const view = $derived(mention ?? (monster ? monsterMentionView(monster) : null));
  const displayName = $derived(label ?? view?.name ?? '');
</script>

{#if view}
  <span
    class="monster-mention"
    class:monster-mention--inline={variant === 'inline'}
    class:monster-mention--log={variant === 'log'}
    class:monster-mention--boss={view.boss}
    style:--monster-color={view.color}
    data-monster-id={view.id}
    title={view.name}
  >
    <span class="monster-mention__glyph" aria-hidden="true">{view.glyph}</span><span class="monster-mention__name">{displayName}</span>
  </span>
{/if}
