#!/usr/bin/env node
/*
 * Generate per-monster death SFX via ElevenLabs (POST /v1/sound-generation).
 * Mirrors the house guide: design/implemented/sound_effect_asset_prompts.md
 * (§1 house suffix, §2 recipe). Each clip is the most-specific tier of the
 * death cascade in src/audio/manifest.ts (DEATH_BY_MONSTER).
 *
 * Output: public/audio/sfx/death-monster-<monsterId>-01.mp3
 * Idempotent: skips files that already exist unless --force (same as the art
 * generators). Prompts live here so every clip is reproducible.
 *
 * Usage:
 *   node scripts/gen-monster-death-sfx.mjs --dry-run        # print prompts, generate nothing
 *   node scripts/gen-monster-death-sfx.mjs                  # generate any missing clips
 *   node scripts/gen-monster-death-sfx.mjs --monster=orc    # one monster
 *   node scripts/gen-monster-death-sfx.mjs --force          # regenerate all
 *   node scripts/gen-monster-death-sfx.mjs --list           # list ids and exit
 *
 * The API key is read from ~/.secrets (ELEVENLABS_API_KEY) or the environment.
 * If you add a monster, add its row to CATALOG below (the audit flags the gap).
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(repoRoot, 'public', 'audio', 'sfx');

const SUFFIX =
  '— dark fantasy dungeon roguelike, dry and close, minimal reverb, short, clean retro game sound effect';

// monsterId | duration_seconds | prompt_influence | prompt (before house suffix)
const CATALOG = [
  ['orc', 1.1, 0.55, 'Hulking orc warrior death, a deep guttural roar cut short by a heavy wet collapse onto stone'],
  ['brown-bat', 0.8, 0.55, 'Large dungeon bat death, a high shrill squeak and frantic wing flaps stopping with a soft flutter'],
  ['snake', 0.9, 0.5, 'Venomous snake death, a sharp angry hiss fading into a limp wet slap on stone'],
  ['hobgoblin', 0.9, 0.55, 'Hobgoblin soldier death, a guttural yelp and a clattering spear dropping on stone'],
  ['eagle', 0.9, 0.5, 'Dungeon eagle death, a piercing raptor screech cut short, feathers and a soft thud'],
  ['leprechaun', 1.1, 0.5, 'Leprechaun trickster death, a mischievous cackle snuffed out with a comical bright coin jingle'],
  ['jungle-flesheater', 1.0, 0.55, 'Carnivorous plant-beast death, wet snapping thorny jaws collapsing into squelching vines'],
  ['king-cobra', 0.9, 0.5, 'Great cobra death, a regal hiss and a hood collapsing into a heavy coiling thud'],
  ['kalius-king-cobra', 1.1, 0.55, 'Ancient crowned cobra death, a deep venomous hiss fading with a hollow echo, grave and large'],
  ['indus-worm', 1.0, 0.55, 'Pale dungeon worm death, a wet bursting squelch and a segmented body slumping into dust'],
  ['pygmy', 0.8, 0.5, 'Small bone-masked raider death, a short sharp shriek and a light bony clatter on stone'],
  ['pantier-pygmy-king', 1.0, 0.55, 'Pygmy king death, an angry shriek and a rough crown clattering down the stone, regal and bitter'],
  ['nymph', 1.0, 0.5, 'Cave nymph death, an eerie melodic gasp dissolving into a soft luminous shimmer'],
  ['rabid-ostrich', 0.9, 0.5, 'Rabid ostrich death, a frantic strangled squawk and thrashing claws going still'],
  ['minotaur', 1.2, 0.55, 'Massive minotaur death, a bellowing roar and a heavy axe and body crashing onto stone'],
  ['michael-the-minotaur', 1.2, 0.55, 'Champion minotaur death, a defiant bellow fading into a heavy ringing collapse, scarred and proud'],
  ['unicorn', 1.0, 0.5, 'Unicorn death, a sorrowful equine cry and a soft fading radiant chime'],
  ['yeti', 1.2, 0.55, 'Towering yeti death, a deep frosty roar cracking into a heavy icy thud and falling frost'],
  ['troll', 1.2, 0.55, 'Cave troll death, a thick guttural groan and a wet mossy heavy body collapsing'],
  ['trogdor-the-troll', 1.3, 0.55, 'Legendary troll death, a roaring groan wreathed in fading ember crackle, heavy and grand'],
  ['golem', 1.1, 0.55, 'Stone golem death, a grinding crack and crumbling rubble collapsing into a dusty heap'],
  ['gary-the-golem', 1.2, 0.55, 'Runic golem death, fracturing stone and a low fading rune-hum as heavy blocks crash down'],
  ['flying-serpent', 1.0, 0.55, 'Winged serpent death, a venomous shriek and beating wings folding into a smoky hiss'],
  ['cyclops', 1.2, 0.55, 'Cyclops death, a deep one-eyed bellow and a massive club and body slamming onto stone'],
  ['colossal-cyclops', 1.4, 0.55, 'Colossal cyclops death, an earth-shaking groan and a giant body crashing with falling debris'],
  ['quinotaur', 1.1, 0.55, 'Five-horned tauric beast death, a strange bellowing snarl and a heavy golden-horned collapse'],
  ['xelhua', 1.3, 0.55, 'Ancient giant guardian death, a ritual booming groan fading into crumbling stone and dust'],
  ['zombie', 1.0, 0.5, 'Undead zombie death, a wet gurgling moan and a limp body slumping with a soft squelch'],
  ['zachary-the-zombie', 1.1, 0.55, 'Champion zombie death, a drawn-out rattling moan and torn armor clattering, grim and final'],
  ['apperation', 1.0, 0.5, 'Ghostly apparition death, a hollow spectral wail dissolving into a soft dissipating whoosh'],
  ['agitated-apperation', 1.0, 0.55, 'Furious apparition death, a jagged shrieking wail tearing apart into a cold dissipating gust'],
  ['dragon', 1.4, 0.58, 'Dragon death, a thunderous pained roar collapsing into a heavy scaled thud and smoldering hiss'],
  ['dragon-king', 1.7, 0.6, 'Dragon king death, a colossal earth-shaking death roar fading into a cinematic low boom and crumbling stone'],
  ['marcus-the-brave', 1.6, 0.58, "A fallen champion's last cry, a heroic human shout fading into a solemn ringing of dropped golden armor"],
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const list = args.includes('--list');
const only = (args.find(a => a.startsWith('--monster=')) ?? '').slice('--monster='.length) || null;

if (list) {
  for (const [id] of CATALOG) console.log(id);
  process.exit(0);
}

function clipFile(id) {
  return join(OUT_DIR, `death-monster-${id}-01.mp3`);
}

function readApiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  try {
    const secrets = readFileSync(join(homedir(), '.secrets'), 'utf8');
    const m = secrets.match(/ELEVENLABS_API_KEY\s*=\s*['"]?([^'"\n]+)/);
    if (m) return m[1].trim();
  } catch {}
  return null;
}

function isMp3(buf) {
  // ID3 tag, or a raw MPEG audio frame sync (0xFFEx/0xFFFx).
  return buf.slice(0, 3).toString('latin1') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
}

async function generate(id, dur, infl, prompt, key) {
  const text = `${prompt} ${SUFFIX}`;
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, duration_seconds: dur, prompt_influence: infl }),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || !isMp3(buf)) {
    throw new Error(`death-monster-${id}: bad response (${res.status}) ${buf.slice(0, 300).toString('latin1')}`);
  }
  writeFileSync(clipFile(id), buf);
}

const rows = CATALOG.filter(([id]) => !only || id === only);
if (only && rows.length === 0) {
  console.error(`Unknown monster id: ${only} (try --list)`);
  process.exit(2);
}

if (dryRun) {
  for (const [id, dur, infl, prompt] of rows) {
    console.log(`death-monster-${id}-01.mp3  (dur ${dur}s, infl ${infl})`);
    console.log(`  ${prompt} ${SUFFIX}\n`);
  }
  console.log(`${rows.length} clip(s) — dry run, nothing generated.`);
  process.exit(0);
}

const key = readApiKey();
if (!key) {
  console.error('ELEVENLABS_API_KEY not set (expected in ~/.secrets or env).');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
let made = 0;
let skipped = 0;
for (const [id, dur, infl, prompt] of rows) {
  if (!force && existsSync(clipFile(id))) {
    skipped++;
    continue;
  }
  process.stdout.write(`>>> death-monster-${id} (dur ${dur}s, infl ${infl}) ... `);
  try {
    await generate(id, dur, infl, prompt, key);
    console.log('ok');
    made++;
  } catch (e) {
    console.log('FAILED');
    console.error(`    ${e.message}`);
    process.exit(1);
  }
}
console.log(`Done. Generated ${made}, skipped ${skipped} existing (of ${rows.length}). Output: ${OUT_DIR}`);
