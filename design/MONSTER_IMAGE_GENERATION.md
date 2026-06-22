# Monster Image Generation

The bestiary art in `public/bestiary/` is generated raster art. Keep output
paths matched to the stable monster id used by `monsterId()`:

```text
public/bestiary/<monster-id>.png
```

## Current Recipe

- Model: `Runpod/FLUX.2-klein-4B-mflux-4bit`
- Base model: `flux2-klein-4b`
- Size: `512x512`
- Steps: `2`
- Seeds: start at `7300` and increment by monster order in `MONSTER_DATABASE`
- Format: PNG

Do not assume a particular project wrapper or local checkout. Any image
generator can be used if it follows the style and writes the same filenames.
For direct mflux usage, the shape is:

```bash
mflux-generate-flux2 \
  --model Runpod/FLUX.2-klein-4B-mflux-4bit \
  --base-model flux2-klein-4b \
  --steps 2 \
  --width 512 \
  --height 512 \
  --seed 7300 \
  --prompt "$PROMPT" \
  --output public/bestiary/orc.png
```

## Prompt Template

```text
single centered dark fantasy roguelike bestiary illustration, monster portrait, SUBJECT, accent color COLOR, full body silhouette readable at small card size, smoky charcoal dungeon background, subtle vignette, dramatic rim lighting, painterly concept art, high contrast, crisp edges, atmospheric but not blurry, no text, no letters, no logo, no border, no UI, no frame
```

For bosses, replace `monster portrait` with:

```text
boss monster portrait, imposing legendary scale
```

Use the monster `color` from `MONSTER_DATABASE` for `COLOR`.

## Subject Hints

| Monster | Subject |
| --- | --- |
| Orc | a hulking tusked orc warrior with crude dungeon armor |
| Brown Bat | a large brown bat with leathery wings mid-flight |
| Snake | a red venomous snake coiled to strike |
| Hobgoblin | a yellow-eyed hobgoblin soldier with a jagged spear |
| Eagle | a pale dungeon eagle with spread wings and hooked talons |
| Leprechaun | a sly green-clad fae trickster clutching a coin |
| Jungle Flesheater | a carnivorous jungle plant-beast with thorny jaws |
| King Cobra | a regal cobra with raised hood and bronze scales |
| Kalius King Cobra | a larger crowned king cobra, ancient and venomous |
| Indus Worm | a pale segmented dungeon worm emerging from dust |
| Pygmy | a small goblin-like dungeon raider with a bone mask |
| Pantier Pygmy King | a small goblin-like king with a rough crown and bone mask |
| Nymph | an eerie lavender cave nymph with flowing hair and luminous eyes |
| Rabid Ostrich | a frantic battle-worn ostrich with sharp claws |
| Minotaur | a massive horned minotaur with a heavy axe |
| Michael the Minotaur | a named champion minotaur with polished horns and battle scars |
| Unicorn | a white unicorn with a radiant horn in dungeon mist |
| Yeti | a towering white yeti with frost clinging to its fur |
| Troll | a green cave troll with heavy limbs and mossy skin |
| Trogdor the Troll | a legendary green troll wreathed in ember glow |
| Golem | a tan stone golem built from cracked dungeon blocks |
| Gary the Golem | a named stone golem with runic cracks and heavy fists |
| Flying Serpent | a neon green winged serpent twisting through smoke |
| Cyclops | a peach-skinned cyclops with one glaring eye and a club |
| Colossal Cyclops | a giant cyclops looming over broken dungeon stones |
| Quinotaur | a strange golden five-horned tauric dungeon beast |
| Xelhua | a red ancient giant guardian with ritual armor |
| Zombie | a green undead dungeon crawler reaching forward |
| Zachary the Zombie | a named undead champion with torn armor and green glow |
| Apperation | a smoky gray apparition drifting from the dungeon floor |
| Agitated Apperation | a furious smoky gray apparition with jagged spectral edges |
| Dragon | a green dragon curled in a cavern, wings half open |
| Dragon King | a colossal emerald dragon king with crown-like horns |
| Marcus the Brave | a heroic golden-armored human warrior with a raised sword |
