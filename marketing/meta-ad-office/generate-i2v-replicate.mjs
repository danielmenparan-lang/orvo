#!/usr/bin/env node
/**
 * Generate image-to-video clips via Replicate (budget-capped).
 * Reads token from REPLICATE_API_TOKEN or Daniel (user secret name).
 *
 * Usage:
 *   node generate-i2v-replicate.mjs
 *   BUDGET_USD=5 node generate-i2v-replicate.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AI = join(__dirname, 'assets-ai-en');
const OUT = join(__dirname, 'assets-ai-en', 'replicate');
const MANIFEST = join(OUT, 'manifest.json');
const BUDGET_USD = parseFloat(process.env.BUDGET_USD || '4.75');
const MODEL = process.env.REPLICATE_I2V_MODEL || 'minimax/hailuo-02';

const TOKEN =
  process.env.REPLICATE_API_TOKEN ||
  process.env.Daniel ||
  process.env.DANIEL ||
  '';

mkdirSync(OUT, { recursive: true });

/** ~$0.38 per 6s 768p clip on hailuo-02 (conservative estimate) */
const EST_COST_PER_CLIP = parseFloat(process.env.EST_COST_PER_CLIP || '0.38');

const SCENES = [
  {
    id: 'meeting',
    image: 'orvo_meeting_wide.png',
    prompt:
      'Modern startup office meeting room, diverse team at table, warm natural light, subtle camera push-in, people shift and listen, cinematic, realistic human motion, orange accent decor',
    duration: 4,
  },
  {
    id: 'leave',
    image: 'orvo_woman_leaving.png',
    prompt:
      'Professional woman in business casual stands up and walks away from conference table toward door, confident smile, coworkers watch, smooth natural walking motion, startup office',
    duration: 4,
  },
  {
    id: 'guy',
    image: 'orvo_guy_reacts.png',
    prompt:
      'Man at office meeting table reacts surprised, leans forward slightly, speaks with confused expression, subtle head movement, realistic lip motion, cinematic close-medium shot',
    duration: 4,
  },
  {
    id: 'phone',
    image: 'orvo_woman_phone.png',
    prompt:
      'Woman holds smartphone up showing website, slight hand lift motion, confident smile, office background, natural human movement, product demo moment',
    duration: 4,
  },
  {
    id: 'nods',
    image: 'orvo_team_nods.png',
    prompt:
      'Office team at meeting table nods in agreement, subtle approving head movements, warm collaborative startup vibe, realistic group reaction',
    duration: 4,
  },
];

function loadManifest() {
  if (!existsSync(MANIFEST)) return { clips: {}, spentUsd: 0 };
  return JSON.parse(readFileSync(MANIFEST, 'utf8'));
}

function saveManifest(m) {
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

function imageToDataUri(path) {
  const buf = readFileSync(path);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function createPrediction(input) {
  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Replicate create failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function pollPrediction(id) {
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
    const data = await res.json();
    if (data.status === 'succeeded') return data;
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Prediction ${data.status}: ${data.error || 'unknown'}`);
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Prediction timed out');
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}

async function main() {
  if (!TOKEN) {
    console.error(
      'Missing API token. Add secret REPLICATE_API_TOKEN (or Daniel) in Cursor Environment Secrets, then restart the agent.',
    );
    process.exit(1);
  }

  const manifest = loadManifest();
  let spent = manifest.spentUsd || 0;
  console.log(`Model: ${MODEL} | Budget: $${BUDGET_USD} | Spent so far: $${spent.toFixed(2)}`);

  for (const scene of SCENES) {
    const outFile = join(OUT, `${scene.id}.mp4`);
    if (existsSync(outFile) && manifest.clips?.[scene.id]?.ok) {
      console.log(`✓ ${scene.id} — cached`);
      continue;
    }

    if (spent + EST_COST_PER_CLIP > BUDGET_USD) {
      console.warn(`⚠ Budget cap reached — skipping ${scene.id}`);
      continue;
    }

    const imagePath = join(AI, scene.image);
    if (!existsSync(imagePath)) {
      console.error(`Missing image: ${imagePath}`);
      process.exit(1);
    }

    console.log(`\n→ Generating ${scene.id} (${basename(scene.image)})…`);
    const input = {
      prompt: scene.prompt,
      first_frame_image: imageToDataUri(imagePath),
      duration: 6,
      resolution: '768p',
      prompt_optimizer: true,
    };

    const created = await createPrediction(input);
    console.log(`  prediction ${created.id} — waiting`);
    const done = await pollPrediction(created.id);
    console.log('');

    const videoUrl = Array.isArray(done.output) ? done.output[0] : done.output;
    if (!videoUrl) throw new Error(`No output for ${scene.id}`);

    await download(videoUrl, outFile);
    spent += EST_COST_PER_CLIP;
    manifest.clips = manifest.clips || {};
    manifest.clips[scene.id] = {
      ok: true,
      file: outFile,
      predictionId: created.id,
      costEstimate: EST_COST_PER_CLIP,
    };
    manifest.spentUsd = spent;
    saveManifest(manifest);
    console.log(`✓ ${scene.id} saved (${(await import('child_process')).spawnSync('du', ['-h', outFile], { encoding: 'utf8' }).stdout.trim()}) — est spent $${spent.toFixed(2)}`);
  }

  console.log(`\nDone. Manifest: ${MANIFEST} | Est. total: $${spent.toFixed(2)} / $${BUDGET_USD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
