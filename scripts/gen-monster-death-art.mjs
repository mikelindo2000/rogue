#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repoRoot, 'public', 'endings');

const MODEL = process.env.ROGUE_MONSTER_DEATH_MODEL ?? 'Runpod/FLUX.2-klein-4B-mflux-4bit';
const BASE_MODEL = process.env.ROGUE_MONSTER_DEATH_BASE_MODEL ?? 'flux2-klein-4b';
const STEPS = process.env.ROGUE_MONSTER_DEATH_STEPS ?? '2';
const WIDTH = process.env.ROGUE_MONSTER_DEATH_WIDTH ?? '512';
const HEIGHT = process.env.ROGUE_MONSTER_DEATH_HEIGHT ?? '512';

const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');
const listIds = process.argv.includes('--list-ids');
const monsterArg = process.argv.find(arg => arg.startsWith('--monster='));
const selectedMonster = monsterArg ? monsterArg.slice('--monster='.length) : null;

const PREFIX = [
  'dark fantasy roguelike game over splash illustration',
  'the player character has fallen to a monster',
  'cinematic square composition for an end-of-run dialog',
  'single strong focal point',
].join(', ');

const SUFFIX = [
  'dramatic dungeon lighting',
  'smoky charcoal stone atmosphere',
  'painterly concept art',
  'high contrast',
  'crisp readable silhouette',
  'rich shadows',
  'subtle vignette',
  'no text',
  'no letters',
  'no logo',
  'no border',
  'no UI',
  'no frame',
].join(', ');

const CATALOG = [
  {
    id: 'orc',
    name: 'Orc',
    subjects: [
      'a hulking green orc looming over a fallen adventurer in a torchlit stone guardroom, crude axe raised in victory',
      'a battered orc warband banner beside a defeated hero, heavy boots and jagged blade catching amber dungeon light',
      'an orc snarling in close silhouette above cracked flagstones, the hero shield split at its feet',
    ],
  },
  {
    id: 'brown-bat',
    name: 'Brown Bat',
    subjects: [
      'a swarm of brown bats spiraling through a low dungeon ceiling over a fallen torch and cloak',
      'one enormous brown bat diving from rafters, wings filling the frame as the hero lies below in shadow',
      'a dark bat cloud erupting from a cracked archway, tiny eyes glinting around abandoned gear',
    ],
  },
  {
    id: 'snake',
    name: 'Snake',
    subjects: [
      'a red dungeon snake coiled around a dropped sword, venom shining on fangs above cold stone',
      'a giant serpent sliding from black cracks beside a fallen adventurer, torchlight reflecting on scales',
      'a poisonous snake striking in a narrow corridor, its coils forming a lethal spiral around scattered equipment',
    ],
  },
  {
    id: 'hobgoblin',
    name: 'Hobgoblin',
    subjects: [
      'a yellow-eyed hobgoblin crouched on rubble over a defeated hero, hooked spear lit by smoky orange fire',
      'a hobgoblin raider dragging a broken shield through a ruined barracks, cruel grin in torchlight',
      'a wiry hobgoblin silhouetted in a doorway, jagged armor and stolen trinkets framing the fallen player',
    ],
  },
  {
    id: 'eagle',
    name: 'Eagle',
    subjects: [
      'a pale dungeon eagle swooping through a broken ceiling shaft, talons over a fallen adventurer',
      'a fierce gray eagle perched on a cracked pillar above scattered gear, wings spread in cold light',
      'an eagle diving through dust and torch smoke, the hero caught in the shadow of its outstretched wings',
    ],
  },
  {
    id: 'leprechaun',
    name: 'Leprechaun',
    subjects: [
      'a wicked leprechaun escaping with a stolen gold purse while the fallen hero reaches across stone',
      'a small green thief laughing from a shadowed archway, coins spilling around a defeated adventurer',
      'a leprechaun vanishing in emerald smoke above an open pack, bright gold glinting in the dark',
    ],
  },
  {
    id: 'jungle-flesheater',
    name: 'Jungle Flesheater',
    subjects: [
      'a carnivorous jungle beast bursting from underground vines over a defeated hero in green mist',
      'a flesheater with thorned jaws and wet leaves crouched in a mossy dungeon chamber, lantern fading nearby',
      'a predatory plant-monster silhouette wrapped around broken masonry, teeth glowing under toxic green light',
    ],
  },
  {
    id: 'king-cobra',
    name: 'King Cobra',
    subjects: [
      'a king cobra rearing with broad hood over a fallen adventurer, bronze scales shining in torchlight',
      'a massive cobra guarding a cracked stairwell, venom dripping beside a dropped dagger',
      'a hooded serpent crowned by amber rim light, coils crossing the hero path through wet stone',
    ],
  },
  {
    id: 'kalius-king-cobra',
    name: 'Kalius King Cobra',
    subjects: [
      'a legendary king cobra with a ritual crown of shed scales towering over a defeated hero',
      'Kalius the cobra coiled around ancient runes, venomous hood glowing with royal menace',
      'a heroic cobra sovereign in a ruined shrine, bronze hood and emerald eyes dominating the death scene',
    ],
  },
  {
    id: 'indus-worm',
    name: 'Indus Worm',
    subjects: [
      'a pale subterranean worm erupting through flagstones beneath the fallen hero, dust and stones flying',
      'a giant cream-colored dungeon worm opening circular jaws in a collapsed tunnel, lantern swallowed by shadow',
      'the Indus worm coiling through broken masonry, its body vanishing into wet holes around abandoned gear',
    ],
  },
  {
    id: 'pygmy',
    name: 'Pygmy',
    subjects: [
      'a small fierce dungeon warrior standing over the fallen player with a bone spear and wary torchlight',
      'a pygmy ambusher emerging from low tunnels around scattered arrows and a cracked helm',
      'a compact raider silhouette in a cramped stone passage, many tiny traps around the hero remains',
    ],
  },
  {
    id: 'pantier-pygmy-king',
    name: 'Pantier Pygmy King',
    subjects: [
      'a pygmy king on a tiny bone throne beside a defeated adventurer, ceremonial spear gleaming gold',
      'Pantier the pygmy king leading shadowed warriors through a low arch, the hero shield discarded below',
      'a crowned small warlord framed by tribal banners and dungeon smoke, triumphant over fallen gear',
    ],
  },
  {
    id: 'nymph',
    name: 'Nymph',
    subjects: [
      'an ethereal nymph glowing lavender above a fallen adventurer, stolen equipment floating around her',
      'a graceful dungeon spirit vanishing through mist with the hero treasure, cold beauty in candlelight',
      'a pale nymph in a ruined fountain chamber, delicate magic and dangerous smile over abandoned armor',
    ],
  },
  {
    id: 'rabid-ostrich',
    name: 'Rabid Ostrich',
    subjects: [
      'a wild rabid ostrich charging through a dungeon corridor, feathers and dust around a fallen hero',
      'a huge frantic ostrich standing over cracked stone, claws near a broken sword in torch smoke',
      'an ostrich silhouette with blazing eyes and ragged feathers, absurdly deadly in a ruined hall',
    ],
  },
  {
    id: 'minotaur',
    name: 'Minotaur',
    subjects: [
      'a massive minotaur lowering blood-dark horns over a fallen adventurer in a labyrinth chamber',
      'a horned beast gripping a heavy axe amid broken pillars, the hero cloak crushed underhoof',
      'a minotaur shadow filling a maze doorway, torchlight tracing horns and muscular silhouette',
    ],
  },
  {
    id: 'michael-the-minotaur',
    name: 'Michael the Minotaur',
    subjects: [
      'a named minotaur champion with ornate horn rings standing victorious in a cracked arena',
      'Michael the minotaur framed by labyrinth walls, ceremonial axe resting beside a defeated hero',
      'a heroic bull-headed warlord roaring under golden dungeon light, broken shield at his feet',
    ],
  },
  {
    id: 'unicorn',
    name: 'Unicorn',
    subjects: [
      'a spectral white unicorn in a dark dungeon, radiant horn over a fallen adventurer on black stone',
      'a fierce unicorn charging through cold mist, holy light turned deadly around shattered armor',
      'a luminous unicorn silhouette in a ruined chapel, beauty and danger surrounding the hero defeat',
    ],
  },
  {
    id: 'yeti',
    name: 'Yeti',
    subjects: [
      'a white-furred yeti looming in a frozen dungeon chamber, icy breath over a fallen torch',
      'a hulking snow beast breaking through frost-covered stone, the hero buried in drifting ice',
      'a yeti silhouette under blue-white light, claws and fur rimmed by frozen mist around scattered gear',
    ],
  },
  {
    id: 'troll',
    name: 'Troll',
    subjects: [
      'a green dungeon troll hunched over a defeated adventurer, mossy claws lit by smoky torchlight',
      'a troll regenerating in sickly green light, broken weapons stuck in its hide around a fallen hero',
      'a huge troll blocking a narrow bridge, the player gear scattered at its feet',
    ],
  },
  {
    id: 'trogdor-the-troll',
    name: 'Trogdor the Troll',
    subjects: [
      'a legendary troll champion with burning green eyes towering in a ruined chamber',
      'Trogdor the troll raising a stone club amid embers and moss, the defeated hero below',
      'a heroic troll monster framed by cracked pillars, scars glowing with toxic green magic',
    ],
  },
  {
    id: 'golem',
    name: 'Golem',
    subjects: [
      'a clay and stone golem standing over crushed armor, rune cracks glowing in its chest',
      'a massive golem fist embedded in broken flagstones beside a fallen sword',
      'a tan stone construct in a silent vault, dust clouds around the defeated adventurer',
    ],
  },
  {
    id: 'gary-the-golem',
    name: 'Gary the Golem',
    subjects: [
      'a named golem sentinel with carved face and glowing runes, victorious in a stone vault',
      'Gary the golem raising a blocky fist under warm torchlight, hero gear flattened nearby',
      'a heroic stone guardian surrounded by shattered pillars, magical seams bright in the dark',
    ],
  },
  {
    id: 'flying-serpent',
    name: 'Flying Serpent',
    subjects: [
      'a neon-green flying serpent arcing through a dungeon hall, magical bolt light around a fallen hero',
      'a winged serpent coiling in midair above wet stone, venom sparks and abandoned gear below',
      'a luminous serpent silhouette striking from above, its body tracing a bright curve through smoke',
    ],
  },
  {
    id: 'cyclops',
    name: 'Cyclops',
    subjects: [
      'a one-eyed giant filling a dungeon archway, club lowered over a defeated adventurer',
      'a cyclops eye glowing in firelight above broken stone, the hero shield splintered below',
      'a huge cyclops silhouette in a ruined hall, single eye reflecting a fallen lantern',
    ],
  },
  {
    id: 'colossal-cyclops',
    name: 'Colossal Cyclops',
    subjects: [
      'a colossal cyclops champion towering through a shattered ceiling, one eye blazing like a furnace',
      'a giant one-eyed warlord with cracked armor standing amid crushed pillars and fallen gear',
      'a heroic cyclops boss silhouette under red dungeon light, enormous club resting near the player',
    ],
  },
  {
    id: 'quinotaur',
    name: 'Quinotaur',
    subjects: [
      'a strange yellow quinotaur beast with many angular horns over a fallen adventurer in a maze',
      'a hybrid dungeon monster with bull-like strength and alien posture, lit by harsh yellow torchlight',
      'the quinotaur looming from a five-way labyrinth crossing, claws and horns framing broken equipment',
    ],
  },
  {
    id: 'xelhua',
    name: 'Xelhua',
    subjects: [
      'a red ancient dungeon fiend named Xelhua towering in volcanic shadow over a fallen hero',
      'Xelhua emerging from carved red stone, eyes bright as embers around shattered armor',
      'a crimson mythic monster silhouette in a deep chamber, smoke and runes surrounding the defeat',
    ],
  },
  {
    id: 'zombie',
    name: 'Zombie',
    subjects: [
      'a green-lit zombie dragging itself across wet stone toward a fallen adventurer',
      'an undead figure standing in a grave-cold dungeon corridor, broken sword and dim lantern below',
      'a zombie horde hinted in deep shadow behind one central corpse-like attacker',
    ],
  },
  {
    id: 'zachary-the-zombie',
    name: 'Zachary the Zombie',
    subjects: [
      'a named zombie champion wearing a cracked crown of rusted iron, victorious over fallen gear',
      'Zachary the zombie rising from green grave mist, one hand gripping the hero cloak',
      'a heroic undead silhouette with bright sickly eyes, grave tokens and broken weapons around him',
    ],
  },
  {
    id: 'apperation',
    name: 'Apperation',
    subjects: [
      'a gray apparition phasing through dungeon walls above a fallen adventurer, ghost light everywhere',
      'a spectral figure with blurred edges floating in cold mist, the hero lantern extinguished below',
      'a haunted silhouette dissolving into smoke, stone floor visible through its translucent body',
    ],
  },
  {
    id: 'agitated-apperation',
    name: 'Agitated Apperation',
    subjects: [
      'an enraged apparition thrashing through a crypt chamber, ghostly arms over a fallen hero',
      'a violent gray spirit splitting into wisps, blue-white light tearing across old stone',
      'an agitated ghost monster with distorted face and stormy aura, scattered gear floating around it',
    ],
  },
  {
    id: 'dragon',
    name: 'Dragon',
    subjects: [
      'a green dragon coiled in a deep dungeon vault, fire glow around the defeated adventurer',
      'a dragon head emerging from smoke and treasure, fangs bright above cracked armor',
      'a great serpent-dragon silhouette filling a lava-lit chamber, claws near a fallen sword',
    ],
  },
  {
    id: 'dragon-king',
    name: 'Dragon King',
    subjects: [
      'a crowned dragon king towering above a ruined throne room, ancient wings and molten light',
      'the dragon king coiled around broken pillars and treasure, the defeated hero tiny in the foreground',
      'a royal green dragon boss breathing ember smoke under a shattered crown-shaped arch',
    ],
  },
  {
    id: 'marcus-the-brave',
    name: 'Marcus the Brave',
    subjects: [
      'a golden-armored dungeon champion named Marcus the Brave standing over a fallen adventurer, sword lowered solemnly',
      'Marcus the Brave framed by boss-floor banners and radiant gold light, the hero defeated at his feet',
      'a final heroic warrior boss in shining armor holding the Amulet chamber, smoke and broken stone behind him',
    ],
  },
];

if (listIds) {
  console.log(JSON.stringify(CATALOG.map(monster => monster.id), null, 2));
  process.exit(0);
}

function promptFor(subject) {
  return `${PREFIX}, ${subject}, ${SUFFIX}`;
}

function outputFile(monsterId, variant) {
  return `monster-${monsterId}-${variant}.png`;
}

function outputPath(monsterId, variant) {
  return join(outDir, outputFile(monsterId, variant));
}

const jobs = CATALOG.flatMap((monster, monsterIndex) =>
  monster.subjects.map((subject, subjectIndex) => ({
    monster,
    variant: subjectIndex + 1,
    seed: 11000 + monsterIndex * 10 + subjectIndex,
    prompt: promptFor(subject),
  }))
).filter(job => !selectedMonster || job.monster.id === selectedMonster);

if (selectedMonster && jobs.length === 0) {
  console.error(`Unknown monster id: ${selectedMonster}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

console.log(`Preparing ${jobs.length} monster death art job${jobs.length === 1 ? '' : 's'}.`);
for (const job of jobs) {
  const out = outputPath(job.monster.id, job.variant);
  const rel = `public/endings/${outputFile(job.monster.id, job.variant)}`;
  if (!force && existsSync(out)) {
    console.log(`skip ${rel}`);
    continue;
  }

  const args = [
    '--model', MODEL,
    '--base-model', BASE_MODEL,
    '--steps', STEPS,
    '--width', WIDTH,
    '--height', HEIGHT,
    '--seed', String(job.seed),
    '--prompt', job.prompt,
    '--output', out,
  ];

  console.log(`${dryRun ? 'dry-run' : 'generate'} ${rel} seed=${job.seed} monster=${job.monster.name}`);
  if (dryRun) {
    console.log(job.prompt);
    continue;
  }

  const result = spawnSync('mflux-generate-flux2', args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Generation failed for ${rel}`);
    process.exit(result.status ?? 1);
  }
}
