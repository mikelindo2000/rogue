#!/usr/bin/env node
/*
 * Generate boss-encounter SFX via ElevenLabs (POST /v1/sound-generation).
 * These are stingers layered OVER the existing 'boss' music bed, fired by the
 * boss-encounter lifecycle (engage / phase change / defeat) plus an optional
 * high-intensity heartbeat loop. Mirrors gen-monster-death-sfx.mjs and the
 * house guide: design/implemented/sound_effect_asset_prompts.md.
 *
 * Output: public/audio/sfx/<id>-01.mp3
 * Idempotent: skips existing files unless --force.
 *
 * Usage:
 *   node scripts/gen-boss-sfx.mjs --dry-run     # print prompts, generate nothing
 *   node scripts/gen-boss-sfx.mjs               # generate any missing clips
 *   node scripts/gen-boss-sfx.mjs --id=boss-encounter
 *   node scripts/gen-boss-sfx.mjs --force       # regenerate all
 *   node scripts/gen-boss-sfx.mjs --list        # list ids and exit
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
const CATALOG = [
  ['boss-encounter', 1.8, 0.6, 'A massive presence awakens in the dark, a single deep dread-laden brass-and-drum hit swelling into a low ominous drone as the floor trembles'],
  ['boss-phase', 1.4, 0.58, 'An enraged colossal beast roars with renewed fury, a guttural rising snarl over cracking stone and a sharp tension hit'],
  ['boss-defeated', 2.0, 0.6, 'A titanic foe collapses, an earth-shaking final death boom fading into crumbling rubble and a low fading triumphant resonance'],
  ['boss-heartbeat', 2.0, 0.5, 'A slow tense low heartbeat pulse felt more than heard, two muffled thuds of dread in still dungeon air'],
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
