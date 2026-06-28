#!/usr/bin/env node
/*
 * Asset audit — item/scene -> image inventory and gap report.
 *
 * Enumerates every image asset the game expects (inventory items, bestiary
 * portraits, floor backgrounds, end-run/death scenes, intro splash) straight
 * from the live game registries via src/assetManifest.ts, then compares that
 * against the files actually present under public/. Reports:
 *
 *   - missing      : expected by the game but absent on disk      (gaps to fill)
 *   - placeholder  : present but a flat-color stub, not real art  (gaps to fill)
 *   - orphan       : present on disk but no registry entry        (stale / renamed)
 *
 * Placeholder detection is byte-size based: a 512x512 flat-color PNG compresses
 * to ~2KB, while real painterly art is 150KB+. Anything present but smaller than
 * PLACEHOLDER_MAX_BYTES is treated as an unfilled gap (counts toward the failure
 * exit code, same as a missing file) so solid-color stubs can't masquerade as
 * finished art.
 *
 * The manifest is loaded through Vite's SSR loader so it sees the real
 * TypeScript registries with zero duplication — add a monster/potion/floor to
 * its registry and it shows up here automatically.
 *
 * Usage:
 *   node scripts/audit-assets.mjs                  # full report, exits 1 if gaps
 *   node scripts/audit-assets.mjs --missing        # only the missing files
 *   node scripts/audit-assets.mjs --placeholders   # only placeholder stubs
 *   node scripts/audit-assets.mjs --orphans        # only orphan files
 *   node scripts/audit-assets.mjs --category=monsters
 *   node scripts/audit-assets.mjs --json           # machine-readable
 *
 * See design/implemented/asset_image_audit.md for the full workflow.
 */
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

const asJson = args.includes('--json');
const missingOnly = args.includes('--missing');
const placeholdersOnly = args.includes('--placeholders');
const orphansOnly = args.includes('--orphans');

// A 512x512 flat-color placeholder PNG compresses to ~2KB; the smallest real
// painted asset in the repo is ~170KB. 16KB leaves a 10x margin on both sides.
const PLACEHOLDER_MAX_BYTES = 16 * 1024;

/** True if a present file is a flat-color stub rather than real generated art. */
function isPlaceholder(dir, file) {
  try {
    return statSync(join(repoRoot, 'public', dir, file)).size < PLACEHOLDER_MAX_BYTES;
  } catch {
    return false;
  }
}
const catArg = args.find(a => a.startsWith('--category='));
const onlyCategory = catArg ? catArg.slice('--category='.length) : null;

async function loadManifest() {
  const vite = await createServer({
    root: repoRoot,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  try {
    const mod = await vite.ssrLoadModule('/src/assetManifest.ts');
    return mod.buildAssetManifest();
  } finally {
    await vite.close();
  }
}

function listPngs(dir) {
  const abs = join(repoRoot, 'public', dir);
  if (!existsSync(abs)) return new Set();
  return new Set(
    readdirSync(abs, { withFileTypes: true })
      .filter(d => d.isFile() && d.name.toLowerCase().endsWith('.png'))
      .map(d => d.name),
  );
}

// ANSI helpers (suppressed when piped / --json)
const tty = process.stdout.isTTY && !asJson;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = s => c('1', s);
const red = s => c('31', s);
const green = s => c('32', s);
const yellow = s => c('33', s);
const dim = s => c('2', s);

const groups = (await loadManifest()).filter(
  g => !onlyCategory || g.category === onlyCategory,
);

if (onlyCategory && groups.length === 0) {
  console.error(`Unknown category: ${onlyCategory}`);
  process.exit(2);
}

// Expected files per directory (dirs are shared, e.g. inventory + endings).
const expectedByDir = new Map(); // dir -> Set(file)
for (const g of groups) {
  const set = expectedByDir.get(g.dir) ?? new Set();
  for (const e of g.entries) set.add(e.file);
  expectedByDir.set(g.dir, set);
}

// Build the per-group report.
const report = groups.map(g => {
  const onDisk = listPngs(g.dir);
  const present = g.entries.filter(e => onDisk.has(e.file));
  const missing = g.entries.filter(e => !onDisk.has(e.file));
  // Present-but-stub files are gaps too: real art still needs generating.
  const placeholders = present.filter(e => isPlaceholder(g.dir, e.file));
  return {
    category: g.category,
    title: g.title,
    dir: g.dir,
    sourceOfTruth: g.sourceOfTruth,
    designDoc: g.designDoc,
    generator: g.generator,
    expected: g.entries.length,
    present: present.length,
    missing,
    placeholders,
  };
});

// Orphans: files on disk not claimed by ANY group for that dir. Only computed
// when auditing the full manifest (a category filter can't see other groups
// that legitimately share the directory).
const orphansByDir = new Map();
if (!onlyCategory) {
  for (const [dir, expected] of expectedByDir) {
    const onDisk = listPngs(dir);
    const orphans = [...onDisk].filter(f => !expected.has(f)).sort();
    if (orphans.length) orphansByDir.set(dir, orphans);
  }
}

const requiredMissing = report.flatMap(r => r.missing.filter(m => !m.optional));
const optionalMissing = report.flatMap(r => r.missing.filter(m => m.optional));
const requiredPlaceholders = report.flatMap(r => r.placeholders.filter(p => !p.optional));

// Required art is "complete" only when present AND real (not a stub).
const hasGaps = requiredMissing.length > 0 || requiredPlaceholders.length > 0;

if (asJson) {
  console.log(
    JSON.stringify(
      {
        groups: report,
        orphansByDir: Object.fromEntries(orphansByDir),
        summary: {
          expected: report.reduce((n, r) => n + r.expected, 0),
          present: report.reduce((n, r) => n + r.present, 0),
          missingRequired: requiredMissing.length,
          missingOptional: optionalMissing.length,
          placeholdersRequired: requiredPlaceholders.length,
          orphans: [...orphansByDir.values()].reduce((n, a) => n + a.length, 0),
        },
      },
      null,
      2,
    ),
  );
  process.exit(hasGaps ? 1 : 0);
}

// --- Human-readable report ---

const allPlaceholders = report.flatMap(r => r.placeholders);

if (placeholdersOnly) {
  if (allPlaceholders.length === 0) {
    console.log(green('No placeholder stubs — every present asset is real art.'));
  } else {
    console.log(bold('Placeholder stubs (present but flat-color, not real art):\n'));
    for (const r of report) {
      if (!r.placeholders.length) continue;
      console.log(`  ${bold(r.title)}  ${dim('-> public/' + r.dir + '/')}`);
      for (const p of r.placeholders) {
        const tag = p.optional ? dim(' (optional)') : '';
        console.log(`    ${yellow('▱')} ${p.file}${tag}  ${dim(p.label)}`);
      }
      console.log(`    ${dim('generate with: ' + r.generator)}`);
    }
  }
  process.exit(0);
}

if (orphansOnly) {
  if (orphansByDir.size === 0) {
    console.log(green('No orphan image files — every asset maps to a registry entry.'));
  } else {
    console.log(bold('Orphan image files (on disk, no registry entry):\n'));
    for (const [dir, orphans] of orphansByDir) {
      console.log(`  ${bold('public/' + dir)}/`);
      for (const f of orphans) console.log(`    ${yellow(f)}`);
    }
    console.log(dim('\n  Orphans are usually stale art from a rename/removal, or art\n  awaiting a registry entry. Delete them or wire them up.'));
  }
  process.exit(0);
}

if (!missingOnly) {
  console.log(bold('\n  ASSET INVENTORY\n'));
  for (const r of report) {
    const ok = r.present === r.expected && r.placeholders.length === 0;
    const parts = [];
    if (r.present < r.expected) parts.push(`${r.expected - r.present} missing`);
    if (r.placeholders.length) parts.push(`${r.placeholders.length} placeholder`);
    const status = ok ? green('OK') : red(parts.join(', '));
    console.log(
      `  ${bold(r.title.padEnd(28))} ${String(r.present).padStart(3)}/${String(r.expected).padEnd(3)} ${status}`,
    );
    console.log(dim(`    source: ${r.sourceOfTruth}`));
  }
}

if (requiredMissing.length || optionalMissing.length) {
  console.log(bold('\n  MISSING IMAGES (gaps to fill)\n'));
  for (const r of report) {
    if (!r.missing.length) continue;
    console.log(`  ${bold(r.title)}  ${dim('-> public/' + r.dir + '/')}`);
    for (const m of r.missing) {
      const tag = m.optional ? dim(' (optional)') : '';
      console.log(`    ${red('✗')} ${m.file}${tag}  ${dim(m.label)}`);
    }
    console.log(`    ${dim('generate with: ' + r.generator)}`);
    console.log(`    ${dim('recipe: ' + r.designDoc)}\n`);
  }
} else if (!missingOnly) {
  console.log(green('\n  All required images present.\n'));
}

if (allPlaceholders.length) {
  console.log(bold('\n  PLACEHOLDER STUBS (present but flat-color, not real art)\n'));
  for (const r of report) {
    if (!r.placeholders.length) continue;
    console.log(`  ${bold(r.title)}  ${dim('-> public/' + r.dir + '/')}`);
    for (const p of r.placeholders) {
      const tag = p.optional ? dim(' (optional)') : '';
      console.log(`    ${yellow('▱')} ${p.file}${tag}  ${dim(p.label)}`);
    }
    console.log(`    ${dim('generate with: ' + r.generator)}`);
    console.log(`    ${dim('recipe: ' + r.designDoc)}\n`);
  }
}

if (!onlyCategory && !missingOnly && orphansByDir.size) {
  console.log(bold('  ORPHANS  ') + dim('(on disk, not in any registry — run --orphans for detail)'));
  for (const [dir, orphans] of orphansByDir) {
    console.log(`    public/${dir}/: ${yellow(orphans.length + ' file(s)')}`);
  }
  console.log('');
}

if (!missingOnly) {
  const expected = report.reduce((n, r) => n + r.expected, 0);
  const present = report.reduce((n, r) => n + r.present, 0);
  console.log(
    bold('  TOTAL  ') +
      `${present}/${expected} present` +
      (requiredMissing.length ? red(`  ${requiredMissing.length} required missing`) : '') +
      (requiredPlaceholders.length ? red(`  ${requiredPlaceholders.length} placeholder`) : '') +
      (!hasGaps ? green('  complete') : '') +
      (optionalMissing.length ? dim(`  (${optionalMissing.length} optional missing)`) : '') +
      '\n',
  );
}

process.exit(hasGaps ? 1 : 0);
