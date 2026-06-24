#!/usr/bin/env node
/*
 * Sound audit — event/cue -> audio-file inventory and gap report.
 *
 * The audio manifest (src/audio/manifest.ts) is ALREADY the typed source of
 * truth: runtime code reads SOUND_ASSETS / MUSIC_TRACKS / VOICE_ASSETS, never a
 * raw path. This script loads that manifest (via Vite's SSR loader) and checks
 * it against the files on disk under public/audio/, reporting:
 *
 *   - missing : referenced by the manifest but absent on disk   (gaps to fill)
 *   - orphan  : present on disk but referenced by nothing        (stale)
 *   - silent  : a defined SoundEvent type that routes to no clip (warnings)
 *
 * "Silent" events are surfaced as WARNINGS (they do not fail the run). Mark one
 * intentional via INTENTIONALLY_SILENT in the manifest to drop it from the
 * warning list. Missing files DO fail (exit 1), so this works as a CI gate.
 *
 * Usage:
 *   node scripts/audit-sounds.mjs                 # full report, exits 1 if files missing
 *   node scripts/audit-sounds.mjs --missing       # only missing files
 *   node scripts/audit-sounds.mjs --orphans       # only orphan files
 *   node scripts/audit-sounds.mjs --silent        # only silent-event warnings
 *   node scripts/audit-sounds.mjs --category=sfx  # sfx | music | voice
 *   node scripts/audit-sounds.mjs --json
 *
 * See design/implemented/sound_asset_audit.md for the full workflow.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

const asJson = args.includes('--json');
const missingOnly = args.includes('--missing');
const orphansOnly = args.includes('--orphans');
const silentOnly = args.includes('--silent');
const catArg = args.find(a => a.startsWith('--category='));
const onlyCategory = catArg ? catArg.slice('--category='.length) : null;

async function loadAudio() {
  const vite = await createServer({
    root: repoRoot,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  try {
    const manifest = await vite.ssrLoadModule('/src/audio/manifest.ts');
    const events = await vite.ssrLoadModule('/src/audio/events.ts');
    return { manifest, events };
  } finally {
    await vite.close();
  }
}

// `audio/sfx/foo.mp3` -> { dir: 'sfx', file: 'foo.mp3' }. Manifest paths are
// relative to AUDIO_BASE (the `audio/` dir), e.g. `sfx/foo.mp3`.
function fromRel(rel) {
  const slash = rel.indexOf('/');
  return { dir: rel.slice(0, slash), file: rel.slice(slash + 1), rel };
}

function listFiles(dir) {
  const abs = join(repoRoot, 'public', 'audio', dir);
  if (!existsSync(abs)) return new Set();
  return new Set(
    readdirSync(abs, { withFileTypes: true })
      .filter(d => d.isFile() && /\.(mp3|ogg|wav)$/i.test(d.name))
      .map(d => d.name),
  );
}

const { manifest, events } = await loadAudio();
const { SOUND_ASSETS, MUSIC_TRACKS, VOICE_ASSETS, INTENTIONALLY_SILENT, resolveClipId } = manifest;
const { SAMPLE_SOUND_EVENTS } = events;

// Build expected entries per category from the registries.
const groups = [
  {
    category: 'sfx',
    title: 'Sound Effects',
    dir: 'sfx',
    sourceOfTruth: 'src/audio/manifest.ts SOUND_ASSETS',
    designDoc: 'design/implemented/sound_effect_asset_prompts.md',
    entries: Object.values(SOUND_ASSETS).flatMap(asset =>
      asset.variants.map(v => ({ label: asset.id, ...fromRel(v) })),
    ),
  },
  {
    category: 'music',
    title: 'Music Beds',
    dir: 'music',
    sourceOfTruth: 'src/audio/manifest.ts MUSIC_TRACKS',
    designDoc: 'design/implemented/music_generation.md',
    entries: Object.entries(MUSIC_TRACKS).map(([ctx, rel]) => ({ label: ctx, ...fromRel(rel) })),
  },
  {
    category: 'voice',
    title: 'Voice Narration',
    dir: 'voice',
    sourceOfTruth: 'src/audio/manifest.ts VOICE_ASSETS',
    designDoc: 'design/implemented/intro_narration_prompt.md',
    entries: Object.values(VOICE_ASSETS).map(a => ({ label: a.id, ...fromRel(a.file) })),
  },
].filter(g => !onlyCategory || g.category === onlyCategory);

if (onlyCategory && groups.length === 0) {
  console.error(`Unknown category: ${onlyCategory} (expected sfx | music | voice)`);
  process.exit(2);
}

const report = groups.map(g => {
  const onDisk = listFiles(g.dir);
  const present = g.entries.filter(e => onDisk.has(e.file));
  const missing = g.entries.filter(e => !onDisk.has(e.file));
  return { ...g, expected: g.entries.length, present: present.length, missing };
});

// Orphans: files on disk in a manifest-tracked dir that nothing references.
const orphansByDir = new Map();
if (!onlyCategory) {
  for (const g of groups) {
    const referenced = new Set(g.entries.map(e => e.file));
    const orphans = [...listFiles(g.dir)].filter(f => !referenced.has(f)).sort();
    if (orphans.length) orphansByDir.set(g.dir, orphans);
  }
}

// Silent events: a defined event type that routes to no clip and is not marked
// intentionally silent. Reported as warnings (do not fail the run).
const silent = { warnings: [], intentional: [] };
if (!onlyCategory) {
  for (const [type, sample] of Object.entries(SAMPLE_SOUND_EVENTS)) {
    if (resolveClipId(sample)) continue;
    const reason = INTENTIONALLY_SILENT[type];
    if (reason) silent.intentional.push({ type, reason });
    else silent.warnings.push({ type });
  }
}

const requiredMissing = report.flatMap(r => r.missing);

// ANSI helpers (suppressed when piped / --json)
const tty = process.stdout.isTTY && !asJson;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = s => c('1', s);
const red = s => c('31', s);
const green = s => c('32', s);
const yellow = s => c('33', s);
const dim = s => c('2', s);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        groups: report.map(({ entries, ...r }) => r),
        orphansByDir: Object.fromEntries(orphansByDir),
        silentEvents: silent,
        summary: {
          expected: report.reduce((n, r) => n + r.expected, 0),
          present: report.reduce((n, r) => n + r.present, 0),
          missing: requiredMissing.length,
          orphans: [...orphansByDir.values()].reduce((n, a) => n + a.length, 0),
          silentWarnings: silent.warnings.length,
        },
      },
      null,
      2,
    ),
  );
  process.exit(requiredMissing.length ? 1 : 0);
}

// --- focused modes ---

if (orphansOnly) {
  if (orphansByDir.size === 0) console.log(green('No orphan audio files.'));
  else {
    console.log(bold('Orphan audio files (on disk, referenced by nothing):\n'));
    for (const [dir, orphans] of orphansByDir) {
      console.log(`  ${bold('public/audio/' + dir)}/`);
      for (const f of orphans) console.log(`    ${yellow(f)}`);
    }
  }
  process.exit(0);
}

if (silentOnly) {
  printSilent();
  process.exit(0);
}

// --- full report ---

if (!missingOnly) {
  console.log(bold('\n  SOUND INVENTORY\n'));
  for (const r of report) {
    const ok = r.present === r.expected;
    console.log(
      `  ${bold(r.title.padEnd(20))} ${String(r.present).padStart(3)}/${String(r.expected).padEnd(3)} ${ok ? green('OK') : red(`${r.expected - r.present} missing`)}`,
    );
    console.log(dim(`    source: ${r.sourceOfTruth}`));
  }
}

if (requiredMissing.length) {
  console.log(bold('\n  MISSING AUDIO (gaps to fill)\n'));
  for (const r of report) {
    if (!r.missing.length) continue;
    console.log(`  ${bold(r.title)}  ${dim('-> public/audio/' + r.dir + '/')}`);
    for (const m of r.missing) console.log(`    ${red('✗')} ${m.file}  ${dim(m.label)}`);
    console.log(`    ${dim('recipe: ' + r.designDoc)}\n`);
  }
} else if (!missingOnly) {
  console.log(green('\n  All referenced audio files present.'));
}

if (!missingOnly) {
  if (orphansByDir.size) {
    console.log('\n' + bold('  ORPHANS  ') + dim('(on disk, unreferenced — run --orphans for detail)'));
    for (const [dir, orphans] of orphansByDir) {
      console.log(`    public/audio/${dir}/: ${yellow(orphans.length + ' file(s)')}`);
    }
  }
  printSilent();

  const expected = report.reduce((n, r) => n + r.expected, 0);
  const present = report.reduce((n, r) => n + r.present, 0);
  console.log(
    '\n' + bold('  TOTAL  ') +
      `${present}/${expected} files present` +
      (requiredMissing.length ? red(`  ${requiredMissing.length} missing`) : green('  complete')) +
      (silent.warnings.length ? yellow(`  ${silent.warnings.length} silent event(s)`) : '') +
      '\n',
  );
}

function printSilent() {
  if (silent.warnings.length === 0 && silent.intentional.length === 0) {
    if (silentOnly) console.log(green('No silent events — every event type routes to a cue.'));
    return;
  }
  if (silent.warnings.length) {
    console.log('\n' + bold('  SILENT EVENTS  ') + yellow('(fire with no cue — author or mark intentional)'));
    for (const s of silent.warnings) console.log(`    ${yellow('!')} ${s.type}`);
    console.log(dim('    add a clip in src/audio/manifest.ts, or list it in INTENTIONALLY_SILENT with a reason.'));
  }
  if (silent.intentional.length) {
    console.log('\n' + bold('  INTENTIONALLY SILENT'));
    for (const s of silent.intentional) console.log(`    ${dim('·')} ${s.type}  ${dim(s.reason)}`);
  }
}

process.exit(requiredMissing.length ? 1 : 0);
