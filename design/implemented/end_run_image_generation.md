# End Run Image Generation

End-run art in `public/endings/` is generated raster art. Keep output paths
matched to the stable scenario and variant names used by `pickEndRunArt()`:

```text
public/endings/<scenario>-<variant>.png
```

The selector mirrors the current end-game stats design: victory and death title
rules choose a scenario, then the run id, seed, turns, and score choose one of
six variants. This gives 54 possible first-view ending images.

Victories now use one dedicated finale opener before the stats screen:
`public/endings/victory-amulet-escape-1.png`. Deaths still use the scenario
selector below, and victory scenario art remains available for stat/title
expansion.

## Current Recipe

- Model: `Runpod/FLUX.2-klein-4B-mflux-4bit`
- Base model: `flux2-klein-4b`
- Size: `512x512`
- Steps: `2`
- Seeds: start at `9100` and increment by row order below
- Format: PNG

For direct mflux usage, the shape is:

```bash
mflux-generate-flux2 \
  --model Runpod/FLUX.2-klein-4B-mflux-4bit \
  --base-model flux2-klein-4b \
  --steps 2 \
  --width 512 \
  --height 512 \
  --seed 9100 \
  --prompt "$PROMPT" \
  --output public/endings/victory-default-1.png
```

## Prompt Template

```text
dark fantasy roguelike end-of-run splash illustration, SUBJECT, cinematic square composition for a game over dialog, dramatic dungeon lighting, smoky charcoal stone atmosphere, painterly concept art, high contrast, crisp readable focal point, rich shadows, subtle vignette, no text, no letters, no logo, no border, no UI, no frame
```

Use a single strong focal subject. The image is shown full-bleed behind the run
title, so avoid busy center textural detail and keep important shapes away from
the lower-right close prompt.

## Scenario Catalogue

| File | Scenario | Seed | Subject |
| --- | --- | ---: | --- |
| `victory-fast-1.png` | fastest blade in the dungeon | 9100 | the victorious hero sprinting up broken dungeon stairs into pale daylight, cloak and blade trailing sparks |
| `victory-fast-2.png` | fastest blade in the dungeon | 9101 | a blurred silver sword stroke cleaving through the final shadow, the hero already turning toward the exit |
| `victory-fast-3.png` | fastest blade in the dungeon | 9102 | the hero vaulting over a fallen boss crown, torchlight streaking like speed lines in the cavern |
| `victory-fast-4.png` | fastest blade in the dungeon | 9103 | a narrow escape corridor with the hero dashing past collapsing stone, golden dawn ahead |
| `victory-fast-5.png` | fastest blade in the dungeon | 9104 | the hero sheathing a glowing blade at the dungeon mouth before dust can settle behind them |
| `victory-fast-6.png` | fastest blade in the dungeon | 9105 | a top-down dungeon path drawn in streaks of light, the hero a bright comet cutting through darkness |
| `victory-heartbeat-1.png` | won by a heartbeat | 9106 | the wounded hero kneeling at the exit, one hand on a bloodied sword, dawn touching their armor |
| `victory-heartbeat-2.png` | won by a heartbeat | 9107 | a battered shield split in two before a final open doorway, the hero barely standing beyond it |
| `victory-heartbeat-3.png` | won by a heartbeat | 9108 | the hero leaning against ancient stone, faint golden light catching a last sliver of health and hope |
| `victory-heartbeat-4.png` | won by a heartbeat | 9109 | a close heroic silhouette limping from black dungeon smoke into cool morning mist |
| `victory-heartbeat-5.png` | won by a heartbeat | 9110 | a shattered potion bottle and exhausted sword arm on the final stair, victory at terrible cost |
| `victory-heartbeat-6.png` | won by a heartbeat | 9111 | the hero crowned by a thin sunbeam in a ruined chamber, armor dented and breath visible |
| `victory-default-1.png` | escaped the dungeon | 9112 | the hero emerging from a mossy dungeon gate with treasure glow behind and sunrise ahead |
| `victory-default-2.png` | escaped the dungeon | 9113 | an open stone portal in a cliff face, the hero silhouetted with a raised sword under clean sky |
| `victory-default-3.png` | escaped the dungeon | 9114 | a quiet victory tableau with the hero standing over the dungeon map, final stair lit gold |
| `victory-default-4.png` | escaped the dungeon | 9115 | a deep dungeon throne room gone still, the hero walking away from a defeated shadow king |
| `victory-default-5.png` | escaped the dungeon | 9116 | scattered gold and broken chains at the dungeon exit, the hero stepping into warm light |
| `victory-default-6.png` | escaped the dungeon | 9117 | an ancient stair spiraling upward through smoke, the hero small but triumphant at the center |
| `death-floor20-1.png` | so close to daylight | 9118 | the final floor doorway visible beyond a fallen hero, daylight impossibly close through cracked stone |
| `death-floor20-2.png` | so close to daylight | 9119 | the hero's sword lying before the last stair, a huge boss shadow fading in the background |
| `death-floor20-3.png` | so close to daylight | 9120 | a near-victory chamber with collapsed pillars, the exit glowing behind a defeated silhouette |
| `death-floor20-4.png` | so close to daylight | 9121 | a broken crown and extinguished torch beside the final threshold, solemn and epic |
| `death-floor20-5.png` | so close to daylight | 9122 | the dungeon's last door half-open, the hero fallen in a pool of cold blue light |
| `death-floor20-6.png` | so close to daylight | 9123 | deep floor twenty carved with boss runes, a heroic cape motionless near the stair of escape |
| `death-starvation-1.png` | the pantry was the real boss | 9124 | an empty ration cloth on cold stone, the weary hero slumped beside a distant unreachable feast mirage |
| `death-starvation-2.png` | the pantry was the real boss | 9125 | a gaunt hero in torchlit darkness reaching toward a single crumb, the dungeon vast and indifferent |
| `death-starvation-3.png` | the pantry was the real boss | 9126 | cracked bowls and dry bones in a forgotten storeroom, the hero's lantern fading low |
| `death-starvation-4.png` | the pantry was the real boss | 9127 | a long empty corridor shaped like a hungry maw, abandoned pack open in the foreground |
| `death-starvation-5.png` | the pantry was the real boss | 9128 | the hero dreaming of bread as ghostly warmth while the real dungeon remains cold and bare |
| `death-starvation-6.png` | the pantry was the real boss | 9129 | an extinguished campfire and empty food pouch beneath looming stone shelves |
| `wall-whisperer-1.png` | wall whisperer | 9130 | hidden runes glowing across cracked dungeon walls around the hero, secret doors half revealed |
| `wall-whisperer-2.png` | wall whisperer | 9131 | the hero pressing one ear to ancient stone as spectral maps unfold in green-blue light |
| `wall-whisperer-3.png` | wall whisperer | 9132 | a secret passage opening behind cascading dust, the hero's lantern catching impossible architecture |
| `wall-whisperer-4.png` | wall whisperer | 9133 | a maze of translucent hidden rooms layered over black stone, the hero standing at its center |
| `wall-whisperer-5.png` | wall whisperer | 9134 | dozens of tiny glyphs whispering from the walls like fireflies, subtle arcane discovery mood |
| `wall-whisperer-6.png` | wall whisperer | 9135 | the dungeon wall splitting into a luminous doorway shaped by ancient carved faces |
| `dungeon-cleaner-1.png` | dungeon cleaner | 9136 | the hero standing amid defeated monster silhouettes, sword lowered, torch smoke curling upward |
| `dungeon-cleaner-2.png` | dungeon cleaner | 9137 | a long hall littered with broken claws and weapons, the hero's armor splashed with dungeon dust |
| `dungeon-cleaner-3.png` | dungeon cleaner | 9138 | the hero framed by a ring of fallen shadows, crimson and amber combat light fading |
| `dungeon-cleaner-4.png` | dungeon cleaner | 9139 | a battered warrior counting notches on a blade beside a mountain of slain dungeon shapes |
| `dungeon-cleaner-5.png` | dungeon cleaner | 9140 | an overhead arena aftermath with monster tracks radiating around the victorious hero |
| `dungeon-cleaner-6.png` | dungeon cleaner | 9141 | the last monster dissolving into smoke before a calm hero in the center of a ruined chamber |
| `chest-enthusiast-1.png` | chest enthusiast | 9142 | the hero surrounded by open treasure chests, gold light flooding a dark stone chamber |
| `chest-enthusiast-2.png` | chest enthusiast | 9143 | a greedy pile of coins and gems spilling down dungeon stairs, the hero laughing in silhouette |
| `chest-enthusiast-3.png` | chest enthusiast | 9144 | ornate locked chests cracked open under torchlight, bright loot reflecting on old armor |
| `chest-enthusiast-4.png` | chest enthusiast | 9145 | the hero dragging an overstuffed treasure sack through a smoky dungeon vault |
| `chest-enthusiast-5.png` | chest enthusiast | 9146 | a golden glow bursting from a chest like sunrise inside the dungeon, dust sparkling everywhere |
| `chest-enthusiast-6.png` | chest enthusiast | 9147 | ancient coins cascading from a pedestal vault while the hero stands amazed in warm rim light |
| `death-default-1.png` | the dungeon claims another | 9148 | the fallen hero's torch guttering out on black stone, the dungeon swallowing the last warm light |
| `death-default-2.png` | the dungeon claims another | 9149 | a lonely sword planted in cracked stone, fog rolling through a silent dungeon corridor |
| `death-default-3.png` | the dungeon claims another | 9150 | the hero's silhouette fading into smoky darkness under a looming arch of ancient stone |
| `death-default-4.png` | the dungeon claims another | 9151 | a dim burial-like chamber with scattered gear and a single cold beam from above |
| `death-default-5.png` | the dungeon claims another | 9152 | shadowy dungeon walls closing around an abandoned shield, grim but beautiful fantasy mood |
| `death-default-6.png` | the dungeon claims another | 9153 | a final lantern reflection on wet stone, the hero's cape disappearing into the dark |
| `victory-amulet-escape-1.png` | victory finale opener | 9160 | the victorious hero stepping out of a cracked dungeon stairwell into sunrise while raising the glowing Amulet of Ballard, golden light spilling across smoke and ancient stone |
