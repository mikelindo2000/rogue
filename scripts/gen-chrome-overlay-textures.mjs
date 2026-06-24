#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repoRoot, 'public', 'chrome-overlays');

const MODEL = process.env.ROGUE_CHROME_TEXTURE_MODEL ?? 'Runpod/FLUX.2-klein-4B-mflux-4bit';
const BASE_MODEL = process.env.ROGUE_CHROME_TEXTURE_BASE_MODEL ?? 'flux2-klein-4b';
const STEPS = process.env.ROGUE_CHROME_TEXTURE_STEPS ?? '8';
const WIDTH = process.env.ROGUE_CHROME_TEXTURE_WIDTH ?? '512';
const HEIGHT = process.env.ROGUE_CHROME_TEXTURE_HEIGHT ?? '512';
const SCHEDULER = process.env.ROGUE_CHROME_TEXTURE_SCHEDULER ?? 'linear';
const DEFAULT_OPACITY = 0.22;

const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');
const pageOnly = process.argv.includes('--page-only');
const candidateArg = process.argv.find(arg => arg.startsWith('--candidate='));
const selectedCandidate = candidateArg ? Number(candidateArg.slice('--candidate='.length)) : null;
const REJECTED_CANDIDATE_IDS = new Set([2, 5, 14, 18, 21, 25, 28, 29, 30, 31, 32, 35]);

const PREFIX = [
  'seamless tileable dark fantasy dungeon chrome overlay texture',
  'flat orthographic material pattern',
  'photogrammetry-style PBR material scan',
  'edge-to-edge repeating surface',
  'designed to sit at low opacity behind readable game UI text',
  'subtle mid-dark values',
  'low focal contrast',
  'no scene composition',
  'no perspective',
].join(', ');

const SUFFIX = [
  '512x512 square texture',
  'even lighting',
  'muted natural color',
  'fine tactile detail',
  'soft worn edges',
  'no central object',
  'no characters',
  'no creatures',
  'no weapons',
  'no text',
  'no letters',
  'no numbers',
  'no writing',
  'no inscriptions',
  'blank material sample',
  'no markings that resemble writing',
  'no symbols',
  'no logo',
  'no UI',
  'no frame',
  'no vignette',
].join(', ');

const CANDIDATES = [
  {
    id: 1,
    slug: 'old-ashlar',
    title: 'Old Ashlar',
    band: 'stone',
    subject: 'ancient ashlar block wall, uneven rectangular stones, lime mortar, tiny chips and hairline cracks',
  },
  {
    id: 2,
    slug: 'wet-limestone',
    title: 'Wet Limestone',
    band: 'stone',
    subject: 'blank damp limestone wall face, soft mineral streaks only, shallow pitting, faint green-gray moisture stains, no scratches or carved marks',
  },
  {
    id: 3,
    slug: 'black-basalt',
    title: 'Black Basalt',
    band: 'stone',
    subject: 'dark basalt blocks, subtle volcanic grain, charcoal joints, small orange heat scars nearly faded',
  },
  {
    id: 4,
    slug: 'granite-rubble',
    title: 'Granite Rubble',
    band: 'stone',
    subject: 'rough granite rubble masonry, irregular fitted stones, dusty mortar, blunt chipped corners',
  },
  {
    id: 5,
    slug: 'slate-scales',
    title: 'Slate Scales',
    band: 'stone',
    subject: 'overlapping slate slabs like broad scales, blue-gray clefts, shallow scratches, restrained contrast',
  },
  {
    id: 6,
    slug: 'sandstone-crypt',
    title: 'Sandstone Crypt',
    band: 'stone',
    subject: 'aged sandstone crypt wall, soft ochre-gray grain, worn block seams, powdery carved wear with no readable symbols',
  },
  {
    id: 7,
    slug: 'salt-crust',
    title: 'Salt Crust',
    band: 'stone',
    subject: 'blank stone wall with pale salt efflorescence, chalky crust around joints, subdued damp shadows, no carvings or tile labels',
  },
  {
    id: 8,
    slug: 'moss-mortar',
    title: 'Moss Mortar',
    band: 'overgrowth',
    subject: 'old dungeon blocks with moss only in mortar seams, tiny roots, dark cool stone, sparse organic flecks',
  },
  {
    id: 9,
    slug: 'root-veined-rock',
    title: 'Root Veined Rock',
    band: 'overgrowth',
    subject: 'cave rock surface threaded with thin brown roots, clay pockets, compact organic texture, no leaves',
  },
  {
    id: 10,
    slug: 'lichen-bricks',
    title: 'Lichen Bricks',
    band: 'overgrowth',
    subject: 'small ancient bricks with pale lichen speckles, green-gray patina, soft dusty grout',
  },
  {
    id: 11,
    slug: 'fungal-stone',
    title: 'Fungal Stone',
    band: 'overgrowth',
    subject: 'subtle fungal staining across dungeon stone, smoky teal spores, flattened surface detail, no mushroom shapes',
  },
  {
    id: 12,
    slug: 'ivy-shadow',
    title: 'Ivy Shadow',
    band: 'overgrowth',
    subject: 'faint dead ivy silhouettes pressed over masonry, brittle vine threads, very low contrast dark greens',
  },
  {
    id: 13,
    seed: 72013,
    slug: 'clay-cave',
    title: 'Clay Cave',
    band: 'cave',
    subject: 'close-up cracked dry clay and mud surface, natural earth pigment, random organic crack network, compact cave-floor material texture, surface only',
  },
  {
    id: 14,
    seed: 52014,
    slug: 'flowstone',
    title: 'Flowstone',
    band: 'cave',
    subject: 'blank flowstone cave material scan, uninterrupted vertical mineral drips only, satin limestone sheen, dark tan and gray bands, no horizontal marks, no labels',
  },
  {
    id: 15,
    slug: 'shale-strata',
    title: 'Shale Strata',
    band: 'cave',
    subject: 'horizontal shale strata, compressed layered rock, thin fissures, smoky charcoal and umber bands',
  },
  {
    id: 16,
    slug: 'lava-cooled',
    title: 'Lava Cooled',
    band: 'cave',
    subject: 'cooled lava stone crust, cracked ropy texture, almost-black surface with faint ember-red lines',
  },
  {
    id: 17,
    slug: 'crystal-dust',
    title: 'Crystal Dust',
    band: 'cave',
    subject: 'blank dark cave wall dusted with tiny quartz flecks, mineral sparkle kept sparse, cool gray-blue stone, no etched marks',
  },
  {
    id: 18,
    seed: 52018,
    slug: 'mudstone',
    title: 'Mudstone',
    band: 'cave',
    subject: 'blank compacted mudstone material scan, dried cracks, damp smears, muted brown-black palette, no writing-like scratches, no artificial marks',
  },
  {
    id: 19,
    slug: 'iron-banded',
    title: 'Iron Banded',
    band: 'metal',
    subject: 'iron-banded dungeon plates, oxidized rivets, dark hammered metal, rust collecting around seams',
  },
  {
    id: 20,
    slug: 'verdigris-copper',
    title: 'Verdigris Copper',
    band: 'metal',
    subject: 'aged copper sheet texture with verdigris blooms, subtle riveted seams, dark teal oxidation',
  },
  {
    id: 21,
    slug: 'tarnished-brass',
    title: 'Tarnished Brass',
    band: 'metal',
    subject: 'blank tarnished brass dungeon paneling, soft brushed grain, smoky brown patina, dull gold in low contrast, no engraved plates',
  },
  {
    id: 22,
    slug: 'chainmail-shadow',
    title: 'Chainmail Shadow',
    band: 'metal',
    subject: 'flattened chainmail-like metal texture, interlocking dark rings, soft shadow, no object silhouette',
  },
  {
    id: 23,
    slug: 'rust-patina',
    title: 'Rust Patina',
    band: 'metal',
    subject: 'rust patina over old iron, mottled red-brown blooms, blackened pits, subdued grit',
  },
  {
    id: 24,
    slug: 'charred-plank',
    title: 'Charred Plank',
    band: 'wood',
    subject: 'charred dungeon wood planks, dark grain, scorched edges, faint ash dust in seams',
  },
  {
    id: 25,
    slug: 'wet-oak',
    title: 'Wet Oak',
    band: 'wood',
    subject: 'water-darkened oak board texture, uneven grain, tiny cracks, dull damp sheen',
  },
  {
    id: 26,
    slug: 'root-wattle',
    title: 'Root Wattle',
    band: 'wood',
    subject: 'woven root and wattle texture, dark flexible branches, mud packed between strands, compact repeatable pattern',
  },
  {
    id: 27,
    slug: 'coffin-wood',
    title: 'Coffin Wood',
    band: 'wood',
    subject: 'aged coffin plank surface, gray-brown wood, faint nail stains, splintered grain without obvious hardware',
  },
  {
    id: 28,
    slug: 'bone-inlay',
    title: 'Bone Inlay',
    band: 'ornament',
    subject: 'abstract bone inlay pattern set into dark stone, small ivory fragments, irregular mosaic, no skulls',
  },
  {
    id: 29,
    slug: 'rune-scarred',
    title: 'Rune Scarred',
    band: 'ornament',
    subject: 'stone scratched by old unreadable ritual scoring, abstract shallow cuts, no legible glyphs or symbols',
  },
  {
    id: 30,
    slug: 'obsidian-vein',
    title: 'Obsidian Vein',
    band: 'ornament',
    subject: 'polished obsidian with subtle smoky veins, black glass stone, very soft violet-gray internal fractures',
  },
  {
    id: 31,
    slug: 'ash-and-soot',
    title: 'Ash and Soot',
    band: 'ornament',
    subject: 'powdery ash and soot rubbed over stone, cloudy charcoal smudges, granular dust texture',
  },
  {
    id: 32,
    slug: 'bloodless-marble',
    title: 'Bloodless Marble',
    band: 'ornament',
    subject: 'dark old marble slab texture, quiet gray veining, worn matte finish, ceremonial but understated',
  },
  {
    id: 33,
    slug: 'ice-rimed-brick',
    title: 'Ice Rimed Brick',
    band: 'elemental',
    subject: 'cold dungeon bricks rimed with thin frost, blue-gray mortar, tiny ice crystals kept subtle',
  },
  {
    id: 34,
    slug: 'ember-mortar',
    title: 'Ember Mortar',
    band: 'elemental',
    subject: 'black stone blocks with faint ember glow deep in mortar cracks, sparse warm points, mostly dark surface',
  },
  {
    id: 35,
    slug: 'violet-arcane-dust',
    title: 'Violet Arcane Dust',
    band: 'elemental',
    subject: 'dark stone dust with faint violet magical residue, soft powdery speckles, no readable magic symbols',
  },
];

const APPROVED_CANDIDATES = CANDIDATES.filter(candidate => !REJECTED_CANDIDATE_IDS.has(candidate.id));

mkdirSync(outDir, { recursive: true });

if (!pageOnly) {
  for (const candidate of APPROVED_CANDIDATES) {
    if (selectedCandidate !== null && candidate.id !== selectedCandidate) continue;

    const output = join(outDir, fileName(candidate));
    const prompt = fullPrompt(candidate);
    const seed = candidate.seed ?? 42000 + candidate.id;

    if (!force && existsSync(output)) {
      console.log(`skip ${output}`);
      continue;
    }

    console.log(`generate ${candidate.id}: ${candidate.title} seed ${seed}`);
    if (dryRun) {
      console.log(prompt);
      continue;
    }

    const result = spawnSync('mflux-generate-flux2', [
      '--model', MODEL,
      '--base-model', BASE_MODEL,
      '--scheduler', SCHEDULER,
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

if (!dryRun) {
  writeFileSync(join(outDir, 'index.html'), renderHtml(), 'utf8');
  console.log(`wrote ${join(outDir, 'index.html')}`);
}

function fullPrompt(candidate) {
  return `${PREFIX}, ${candidate.subject}, ${SUFFIX}`;
}

function fileName(candidate) {
  return `texture-${String(candidate.id).padStart(2, '0')}-${candidate.slug}.png`;
}

function renderHtml() {
  const cards = APPROVED_CANDIDATES.map(candidate => renderCard(candidate)).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rogue Chrome Overlay Texture Candidates</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #090807;
      --rail: #12100e;
      --rail-2: #181512;
      --ink: #ece3d2;
      --muted: #a79b88;
      --line: #2b251f;
      --accent: #d7a84f;
      --danger: #cf5f4d;
      --opacity: ${DEFAULT_OPACITY};
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 50% 0%, rgba(215, 168, 79, 0.12), transparent 42rem),
        var(--bg);
      color: var(--ink);
      font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }

    header {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem clamp(1rem, 3vw, 2rem);
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--bg) 86%, transparent);
      backdrop-filter: blur(16px);
    }

    h1 {
      margin: 0;
      font-size: clamp(1rem, 2vw, 1.35rem);
      font-weight: 700;
      letter-spacing: 0;
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: var(--muted);
      white-space: nowrap;
    }

    input[type="range"] {
      width: min(22vw, 220px);
      accent-color: var(--accent);
    }

    main {
      width: min(1800px, 100%);
      margin: 0 auto;
      padding: clamp(1rem, 3vw, 2rem);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1rem;
    }

    article {
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      background: var(--rail);
      min-width: 0;
    }

    .meta {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 0.85rem;
      border-bottom: 1px solid var(--line);
      background: var(--rail-2);
    }

    .title {
      min-width: 0;
      font-size: 0.95rem;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tag {
      flex: 0 0 auto;
      color: var(--muted);
      font-size: 0.75rem;
      text-transform: uppercase;
    }

    .preview {
      display: grid;
      grid-template-columns: 42% 58%;
      min-height: 270px;
    }

    .raw {
      min-height: 100%;
      background-image: var(--texture);
      background-size: cover;
      background-position: center;
      border-right: 1px solid var(--line);
    }

    .chrome {
      position: relative;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 0.75rem;
      padding: 0.9rem;
      isolation: isolate;
      background: var(--rail);
      overflow: hidden;
    }

    .chrome::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      opacity: var(--opacity);
      background-image: var(--texture);
      background-size: 128px 128px;
      background-repeat: repeat;
      filter: saturate(0.82) contrast(0.92);
    }

    .chrome::after {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      background:
        linear-gradient(90deg, rgba(0, 0, 0, 0.42), transparent 45%, rgba(0, 0, 0, 0.34)),
        rgba(9, 8, 7, 0.42);
    }

    .topline,
    .log,
    .footer {
      border: 1px solid color-mix(in srgb, var(--line) 82%, black);
      border-radius: 6px;
      background: rgba(12, 11, 9, 0.68);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
    }

    .topline {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.4rem 0.55rem;
      padding: 0.55rem;
      color: var(--ink);
    }

    .stat {
      min-width: 0;
    }

    .stat b {
      display: inline;
      margin-right: 0.35rem;
      color: var(--accent);
      font-size: 0.72rem;
      font-weight: 700;
    }

    .stat span {
      display: inline;
      overflow: hidden;
      white-space: nowrap;
    }

    .log {
      padding: 0.65rem;
      color: var(--muted);
    }

    .log strong {
      color: var(--ink);
      font-weight: 700;
    }

    .log p {
      margin: 0 0 0.42rem;
    }

    .log p:last-child {
      margin-bottom: 0;
      color: var(--danger);
    }

    .footer {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.55rem 0.65rem;
      color: var(--muted);
      font-size: 0.78rem;
    }

    .prompt {
      padding: 0.75rem 0.85rem 0.85rem;
      color: var(--muted);
      font-size: 0.75rem;
      border-top: 1px solid var(--line);
    }

    @media (max-width: 560px) {
      header {
        align-items: flex-start;
        flex-direction: column;
      }

      input[type="range"] {
        width: 52vw;
      }

      .preview {
        grid-template-columns: 1fr;
      }

      .raw {
        min-height: 180px;
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>Rogue Chrome Overlay Texture Candidates</h1>
    <label class="controls">
      <span>Opacity <output id="opacity-value">${DEFAULT_OPACITY}</output></span>
      <input id="opacity" type="range" min="0" max="1" value="${DEFAULT_OPACITY}" step="0.01">
    </label>
  </header>
  <main>
    <section class="grid">
${cards}
    </section>
  </main>
  <script>
    const slider = document.querySelector('#opacity');
    const value = document.querySelector('#opacity-value');
    const sync = () => {
      document.documentElement.style.setProperty('--opacity', slider.value);
      value.value = Number(slider.value).toFixed(2);
    };
    slider.addEventListener('input', sync);
    sync();
  </script>
</body>
</html>
`;
}

function renderCard(candidate) {
  const file = fileName(candidate);
  const prompt = fullPrompt(candidate);
  return `      <article style="--texture: url('${escapeAttr(file)}');">
        <div class="meta">
          <div class="title">${candidate.id}. ${escapeHtml(candidate.title)}</div>
          <div class="tag">${escapeHtml(candidate.band)}</div>
        </div>
        <div class="preview">
          <div class="raw" aria-label="${escapeAttr(candidate.title)} raw texture"></div>
          <div class="chrome">
            <div class="topline">
              <div class="stat"><b>HP</b><span>47/52</span></div>
              <div class="stat"><b>AC</b><span>3</span></div>
              <div class="stat"><b>STR</b><span>17</span></div>
              <div class="stat"><b>Gold</b><span>1426</span></div>
            </div>
            <div class="log">
              <p><strong>You descend.</strong> The walls close around the old stair.</p>
              <p>A pressure plate clicks somewhere in the dark.</p>
              <p>The goblin misses you.</p>
            </div>
            <div class="footer">
              <span>Floor ${((candidate.id - 1) % 20) + 1}</span>
              <span>${escapeHtml(file)}</span>
            </div>
          </div>
        </div>
        <div class="prompt">${escapeHtml(prompt)}</div>
      </article>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}
