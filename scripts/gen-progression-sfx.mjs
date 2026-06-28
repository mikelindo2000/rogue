#!/usr/bin/env node
/*
 * Generate player vitals & progression SFX via ElevenLabs (POST /v1/sound-generation).
 * These are the status-channel cues for the run's milestones — low/critical health
 * warnings, the level-up chime, the amulet discovery stinger, the amulet escape
 * fanfare, and the death tone. Mirrors gen-boss-sfx.mjs and the house guide:
 * design/implemented/sound_effect_asset_prompts.md (§ Player vitals & progression).
 *
 * Output: public/audio/sfx/<id>-01.mp3
 * Idempotent: skips existing files unless --force.
 *
 * Usage:
 *   node scripts/gen-progression-sfx.mjs --dry-run     # print prompts, generate nothing
 *   node scripts/gen-progression-sfx.mjs               # generate any missing clips
 *   node scripts/gen-progression-sfx.mjs --id=amulet-found
 *   node scripts/gen-progression-sfx.mjs --force       # regenerate all
 *   node scripts/gen-progression-sfx.mjs --list        # list ids and exit
 *
 * The API key is read from ~/.secrets (ELEVENLABS_API_KEY) or the environment.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(repoRoot, 'public', 'audio', 'sfx');

const SUFFIX =
  '— dark fantasy dungeon roguelike, dry and close, minimal reverb, short, clean retro game sound effect';

// id | duration_seconds | prompt_influence | prompt (before house suffix)
// Keep in sync with the design-doc table (§ Player vitals & progression).
const CATALOG = [
  ['player-lowhealth', 0.8, 0.5, 'A low warning heartbeat thud with a faint uneasy tone, danger'],
  ['player-criticalhealth', 0.9, 0.5, 'An urgent fast double heartbeat with a tense rising warning sting, near death'],
  ['player-levelup', 1.6, 0.45, 'Bright magical level-up chime, ascending three-note arpeggio on glassy bells, a soft golden shimmer tail, warm and rewarding, retro fantasy RPG UI, no music bed'],
  ['amulet-found', 1.6, 0.55, 'A legendary amulet seized from a dragon hoard, a bright magical discovery shimmer rising over a deep resonant powerful swell, awe and triumph with a faint ominous weight'],
  ['victory-amulet', 1.6, 0.58, 'Triumphant magical amulet flare, warm golden chime rising into a short heroic resolve, stone stair echo and daylight shimmer'],
  ['player-death', 1.5, 0.55, 'A somber low descending tone of defeat, the hero falls, game over, fading'],
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const list = args.includes('--list');
const only = (args.find(a => a.startsWith('--id=')) ?? '').slice('--id='.length) || null;

if (list) {
  for (const [id] of CATALOG) console.log(id);
  process.exit(0);
}

function clipFile(id) {
  return join(OUT_DIR, `${id}-01.mp3`);
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
    throw new Error(`${id}: bad response (${res.status}) ${buf.slice(0, 300).toString('latin1')}`);
  }
  writeFileSync(clipFile(id), buf);
}

const rows = CATALOG.filter(([id]) => !only || id === only);
if (only && rows.length === 0) {
  console.error(`Unknown id: ${only} (try --list)`);
  process.exit(2);
}

if (dryRun) {
  for (const [id, dur, infl, prompt] of rows) {
    console.log(`${id}-01.mp3  (dur ${dur}s, infl ${infl})`);
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
  process.stdout.write(`>>> ${id} (dur ${dur}s, infl ${infl}) ... `);
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
