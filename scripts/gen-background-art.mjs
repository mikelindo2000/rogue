#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repoRoot, 'public', 'backgrounds');

const MODEL = process.env.ROGUE_BG_MODEL ?? 'Runpod/FLUX.2-klein-4B-mflux-4bit';
const BASE_MODEL = process.env.ROGUE_BG_BASE_MODEL ?? 'flux2-klein-4b';
const STEPS = process.env.ROGUE_BG_STEPS ?? '8';
const WIDTH = process.env.ROGUE_BG_WIDTH ?? '512';
const HEIGHT = process.env.ROGUE_BG_HEIGHT ?? '512';

const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');
const floorArg = process.argv.find(arg => arg.startsWith('--floor='));
const selectedFloor = floorArg ? Number(floorArg.slice('--floor='.length)) : null;

const PREFIX = [
  'dark fantasy roguelike dungeon background illustration',
  'wide environmental scene',
  'designed to sit behind a tile-based dungeon board',
  'no central hero',
  'no foreground character',
].join(', ');

const SUFFIX = [
  'cinematic composition',
  'painterly concept art',
  'deep shadows',
  'strong vignette',
  'clear readable silhouettes',
  'atmospheric depth',
  'high contrast',
  'no text',
  'no letters',
  'no logo',
  'no UI',
  'no frame',
].join(', ');

const THEMES = [
  {
    floor: 1,
    title: 'Ember Gate',
    prompts: [
      'a cautious torchlit stone entrance hall with cracked flagstones, low amber braziers, and a dark stairwell waiting beyond',
      'a narrow first-floor dungeon corridor with warm torch smoke, old iron sconces, chipped walls, and safe darkness at the edges',
      'a ruined guard vestibule with fallen shields, dust motes in amber light, and a simple barred doorway into deeper black',
      'a quiet cellar landing with damp stones, one lantern glow, scattered straw, and the first hint of ancient masonry',
    ],
  },
  {
    floor: 2,
    title: 'Collapsed Barracks',
    prompts: [
      'abandoned underground barracks with broken bunks, rusted spear racks, warm torch pools, and deeper shadow between pillars',
      'a collapsed training room with cracked practice dummies, splintered weapon stands, and amber firelight under sagging beams',
      'a deserted mess hall with overturned benches, old bones near cold hearths, and smoky orange light from wall sconces',
      'a watch room with a fallen portcullis, battered shields on the walls, and dust blowing through a fractured ceiling',
    ],
  },
  {
    floor: 3,
    title: 'Moss-Lit Cistern',
    prompts: [
      'an underground cistern with shallow black water, mossy stone arches, reflected torchlight, and faint green growth in cracks',
      'a damp aqueduct chamber with dripping pipes, slick steps, mossy walls, and lantern light swallowed by dark water',
      'a waterlogged storage vault with floating crates, algae-stained columns, and amber-green reflections on wet stone',
      'a flooded stair landing with rippling puddles, roots breaking through the ceiling, and small candles on cracked ledges',
    ],
  },
  {
    floor: 4,
    title: 'Raider Warrens',
    prompts: [
      'a cramped raider den carved into old masonry, crude barricades, rope bridges, stolen lanterns, and many small shadowed alcoves',
      'a maze of low tunnels with scrap-metal gates, hanging charms, smoky cook fires, and scratch marks along the walls',
      'a looted supply chamber with stacked crates, torn banners, bone dice on a table, and amber light under a low ceiling',
      'a rough palisade crossing inside the dungeon with spears, patched hides, and narrow holes leading into black side tunnels',
    ],
  },
  {
    floor: 5,
    title: 'Forgotten Chapel',
    prompts: [
      'a forgotten subterranean chapel with broken pews, a cracked altar, candle smoke, and warm light fading into solemn darkness',
      'a burial shrine with toppled statues, dusty prayer tiles, dim votive candles, and a sealed stone door behind the altar',
      'a chapel nave split by roots and rubble, amber lanterns, shattered stained glass on the floor, and long sacred shadows',
      'a reliquary room with tarnished brass fixtures, empty niches, incense haze, and a quiet oppressive glow',
    ],
  },
  {
    floor: 6,
    title: 'Verdigris Garden',
    prompts: [
      'a poisonous underground garden with verdigris statues, thorny vines, green mist, and pale flowers growing from cracked stone',
      'an overgrown courtyard chamber with copper-green fountains, hanging roots, bioluminescent moss, and toxic fog near the floor',
      'a ruined greenhouse under the dungeon with broken glass ribs, curling vines, wet stone, and eerie green lantern light',
      'a moss-choked gallery with oxidized bronze doors, crawling roots, small glowing spores, and deeper teal shadows',
    ],
  },
  {
    floor: 7,
    title: 'Sunken Archive',
    prompts: [
      'a flooded archive with half-submerged bookshelves, blue-green candles, drifting pages, and arcane diagrams glowing under water',
      'a library corridor sinking into black water, tilted shelves, verdigris lamps, and scrolls sealed behind cracked glass',
      'a drowned study with floating books, collapsed ladders, green magical reflections, and a heavy stone reading desk',
      'a manuscript vault with wet parchment bundles, copper pipes, thin mist, and sigils glowing faintly through mildew',
    ],
  },
  {
    floor: 8,
    title: 'Crystal Mines',
    prompts: [
      'a jagged crystal mine with teal and white shards piercing the walls, mine rails, wet rock, and dangerous reflected torchlight',
      'a cavern worksite with glowing mineral veins, broken carts, rope lifts, and razor crystal clusters in deep shadow',
      'a narrow excavation tunnel with luminous quartz ribs, splintered supports, and cold green sparks in the dust',
      'a crystal quarry chamber with hanging chains, fractured mirrors of stone, and bright mineral light cutting through darkness',
    ],
  },
  {
    floor: 9,
    title: 'Fungal Furnace',
    prompts: [
      'a hot fungal furnace chamber with giant mushrooms, rusted boilers, green spores, orange heat vents, and wet black stone',
      'an overgrown engine room with copper pipes, puffing fungus caps, teal poison haze, and furnace glow behind grates',
      'a mushroom-choked forge with cracked anvils, boiling runoff channels, and sickly green light mixing with ember orange',
      'a humid tunnel of fungus shelves, sweating masonry, old pressure gauges, and dense spores caught in lantern beams',
    ],
  },
  {
    floor: 10,
    title: 'Bone Market',
    prompts: [
      'a grim underground bone market with empty stalls, skull lanterns, green patina chains, and a long corridor of hanging charms',
      'a charnel trading hall with bone piles, cracked scales, tattered awnings, and teal mist pooling around stone counters',
      'a skeletal bazaar arcade with rib arches, tarnished coin bowls, black banners, and eerie green fire in braziers',
      'a forsaken auction pit with bone railings, rusted hooks, cold candles, and a threatening dark doorway below',
    ],
  },
  {
    floor: 11,
    title: 'Violet Vaults',
    prompts: [
      'a violet magical vault with floating stone locks, purple light leaking through seams, and polished black floor reflections',
      'a deep treasure antechamber with sealed rune doors, violet sigils, silver dust, and impossible shadows bending inward',
      'a vaulted corridor of arcane safes with glowing purple keyholes, cracked marble, and cold mist along the floor',
      'a spellbound strongroom with levitating chains, violet ward circles, and dark pillars vanishing into a starless ceiling',
    ],
  },
  {
    floor: 12,
    title: 'Mirror Labyrinth',
    prompts: [
      'a mirror labyrinth chamber with broken reflective walls, violet torchlight, fractured corridors, and many false exits',
      'a hall of black glass mirrors, warped reflections of doorways, purple haze, and sharp shards scattered across stone',
      'a mirrored crossing with cracked panels, suspended silver dust, cold violet rim light, and distorted arches receding forever',
      'a reflective maze room with tilted mirror slabs, shadow duplicates, violet runes, and a narrow safe path through splinters',
    ],
  },
  {
    floor: 13,
    title: 'Storm Crypts',
    prompts: [
      'an ancient crypt charged with violet lightning, stone coffins, storm clouds under the ceiling, and blue-white arcs between pillars',
      'a burial hall with cracked sarcophagi, electric runes, purple fog, and lightning flashing through grated ceiling vents',
      'a storm-lit ossuary with skull niches, wet black stone, violet thunder glow, and metal rods drawing sparks from the air',
      'a restless tomb crossing with floating ash, broken coffin lids, electric blue sigils, and violent purple backlight',
    ],
  },
  {
    floor: 14,
    title: 'Astral Prison',
    prompts: [
      'an astral prison block with floating cells, violet starfields beyond cracked walls, chains hanging into impossible space',
      'a cosmic dungeon bridge with suspended cages, purple nebula light, stone fragments drifting, and a bottomless void below',
      'a jailer hall with rune-barred cells, gravity bending around pillars, cold violet stars, and chains pulled taut into darkness',
      'a fractured prison rotunda with levitating platforms, astral mist, glowing locks, and distant constellations behind stone arches',
    ],
  },
  {
    floor: 15,
    title: 'Black Altar',
    prompts: [
      'a black altar chamber with violet ritual circles, obsidian steps, extinguished candles, and a heavy shadow above the shrine',
      'a sacrificial hall with cracked black stone, purple flame braziers, hanging chains, and a sealed gate radiating danger',
      'a ritual nave with thorned metal fixtures, violet smoke, blood-dark stone, and an altar lit from below',
      'an obsidian sanctum with carved channels, purple runes crawling over the floor, and looming pillars around a central altar',
    ],
  },
  {
    floor: 16,
    title: 'Dragon Depths',
    prompts: [
      'a scorched dragon-depth hallway with red-hot cracks, blackened stone arches, ember rain, and claw marks gouged through masonry',
      'a cavernous lava-warmed dungeon room with charred columns, molten seams, smoke curtains, and orange firelight in every crack',
      'a burned treasure passage with melted gold streaks, broken shields, red dragon-scale patterns on walls, and choking ash',
      'a furnace-like descent chamber with dragon statues, glowing magma vents, and black smoke rolling across the ceiling',
    ],
  },
  {
    floor: 17,
    title: 'Lava Aqueduct',
    prompts: [
      'a lava aqueduct crossing with molten channels, black stone bridges, orange spray, and heat shimmer warping distant doorways',
      'a volcanic cistern with magma falls, scorched walkways, iron grates, and fierce red light under smoke',
      'a long molten canal tunnel with cracked basalt walls, broken sluice wheels, and sparks rising through oppressive darkness',
      'a perilous bridge chamber over flowing lava, chained stone platforms, ember clouds, and red reflections on obsidian',
    ],
  },
  {
    floor: 18,
    title: 'Obsidian Armory',
    prompts: [
      'an obsidian armory with black blade racks, red furnace slots, dragon-bone armor stands, and sparks in smoky air',
      'a war forge with enormous anvils, quenched weapons, lava-lit walls, and shadows shaped like marching soldiers',
      'a weapon vault of charred iron doors, hanging greatswords, ember-red sigils, and cracked basalt floor plates',
      'a siege arsenal with broken ballista parts, stacked shields, molten chains, and orange light pulsing behind grates',
    ],
  },
  {
    floor: 19,
    title: 'Ashen Throne Approach',
    prompts: [
      'a vast ashen throne approach with giant steps, red smoke, toppled statues, and a distant sealed door glowing like a wound',
      'a final antechamber of black columns, drifting ash, molten cracks, and torn banners leading toward a terrifying throne room',
      'a dragon-king processional hall with scorched carpets, ember braziers, shattered crowns, and oppressive red darkness ahead',
      'a ruined royal landing with cracked obsidian stairs, ash storms through broken walls, and a huge locked gate burning red',
    ],
  },
  {
    floor: 20,
    title: 'Amulet Heart',
    prompts: [
      'the final dungeon heart chamber with the Amulet of Ballard glow suspended above black stone, lava halos, and colossal boss shadows',
      'a climactic boss arena with a circular obsidian floor, blazing amulet light, dragon-scale pillars, and violent red-gold smoke',
      'a world-ending treasure sanctum with the amulet radiating gold at the far altar, molten fissures, and darkness collapsing inward',
      'a final escape-or-die chamber with shattered throne, floating amulet glow, burning arches, and storming embers against black stone',
    ],
  },
];

mkdirSync(outDir, { recursive: true });

for (const theme of THEMES) {
  if (selectedFloor !== null && theme.floor !== selectedFloor) continue;

  for (const [index, subject] of theme.prompts.entries()) {
    const variant = String.fromCharCode('a'.charCodeAt(0) + index);
    const seed = 10000 + theme.floor * 10 + index;
    const output = join(outDir, `floor-${String(theme.floor).padStart(2, '0')}-${variant}.png`);
    const prompt = `${PREFIX}, ${subject}, ${SUFFIX}`;

    if (!force && existsSync(output)) {
      console.log(`skip ${output}`);
      continue;
    }

    console.log(`generate floor ${theme.floor} ${variant} seed ${seed}: ${theme.title}`);
    if (dryRun) {
      console.log(prompt);
      continue;
    }

    const result = spawnSync('mflux-generate-flux2', [
      '--model', MODEL,
      '--base-model', BASE_MODEL,
      '--steps', STEPS,
      '--width', WIDTH,
      '--height', HEIGHT,
      '--seed', String(seed),
      '--prompt', prompt,
      '--output', output,
    ], { stdio: 'inherit' });

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}
