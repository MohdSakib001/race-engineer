#!/usr/bin/env node
// Re-runnable fetcher for the F1-25 track SVG assets.
//
// Source: https://github.com/julesr0y/f1-circuits-svg (CC-BY-4.0)
// Style:  detailed/white  — racing line + start/finish + direction arrow
//
// We map the F1-25 track id → the upstream filename and write the result
// to src/renderer/assets/track-svgs/{id}.svg so the TrackMap UI can load
// it directly via Vite's `?raw` import.
//
// Run:  node scripts/fetch-track-svgs.mjs
//
// Requires Node 18+ (built-in fetch).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'src', 'renderer', 'assets', 'track-svgs');
const BASE =
  'https://raw.githubusercontent.com/julesr0y/f1-circuits-svg/main/circuits/detailed/white';

// F1-25 track id → julesr0y filename (without .svg extension)
const MAP = {
  0:  'melbourne-2',
  2:  'shanghai-1',
  3:  'bahrain-1',
  4:  'catalunya-6',
  5:  'monaco-6',
  6:  'montreal-6',
  7:  'silverstone-8',
  9:  'hungaroring-3',
  10: 'spa-francorchamps-4',
  11: 'monza-7',
  12: 'marina-bay-4',
  13: 'suzuka-2',
  14: 'yas-marina-2',
  15: 'austin-1',
  16: 'interlagos-2',
  17: 'spielberg-3',
  19: 'mexico-city-3',
  20: 'baku-1',
  26: 'zandvoort-5',
  29: 'jeddah-1',
  30: 'miami-1',
  31: 'las-vegas-1',
  32: 'lusail-1',
};

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let ok = 0, fail = 0;
  for (const [id, name] of Object.entries(MAP)) {
    const url = `${BASE}/${name}.svg`;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      await writeFile(join(OUT_DIR, `${id}.svg`), text, 'utf8');
      console.log(`OK  ${id}.svg <- ${name}.svg`);
      ok++;
    } catch (e) {
      console.warn(`FAIL ${id} (${name}): ${e.message}`);
      fail++;
    }
  }
  console.log(`Done: ${ok} ok, ${fail} fail.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
