#!/usr/bin/env node
// Dumps every endpoint (M/L/C) of a track's racing-line path so we can
// identify straights, apexes and midpoints when tracing the pit lane.
//
// Usage:  node scripts/dump-track-vertices.mjs <trackId>
// Example: node scripts/dump-track-vertices.mjs 20       # Baku
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const tid = process.argv[2];
if (!tid) { console.error('usage: node scripts/dump-track-vertices.mjs <trackId>'); process.exit(1); }
const svgPath = join(HERE, '..', 'src', 'renderer', 'assets', 'track-svgs', `${tid}.svg`);
const svg = readFileSync(svgPath, 'utf8');

// Pull the racing-line path (first <path> element) and its d attribute.
const dMatch = svg.match(/<path[^>]*\sd="([^"]+)"/);
if (!dMatch) { console.error('no <path d=""> found'); process.exit(1); }
const d = dMatch[1];
const vbMatch = svg.match(/viewBox=["']([^"']+)["']/);
console.log('viewBox:', vbMatch ? vbMatch[1] : '(none)');

// Minimal SVG path tokenizer + endpoint walker.
const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
let i = 0, x = 0, y = 0, sx = 0, sy = 0;
const pts = [];
const isCmd = (t) => /^[a-zA-Z]$/.test(t);
const next = () => parseFloat(toks[i++]);
while (i < toks.length) {
  let cmd = toks[i];
  if (isCmd(cmd)) i++; else cmd = pts.length ? 'L' : 'M';
  switch (cmd) {
    case 'M': x = next(); y = next(); sx = x; sy = y; pts.push([x, y]);
      while (i < toks.length && !isCmd(toks[i])) { x = next(); y = next(); pts.push([x, y]); }
      break;
    case 'm': x += next(); y += next(); sx = x; sy = y; pts.push([x, y]);
      while (i < toks.length && !isCmd(toks[i])) { x += next(); y += next(); pts.push([x, y]); }
      break;
    case 'L': while (i < toks.length && !isCmd(toks[i])) { x = next(); y = next(); pts.push([x, y]); } break;
    case 'l': while (i < toks.length && !isCmd(toks[i])) { x += next(); y += next(); pts.push([x, y]); } break;
    case 'H': while (i < toks.length && !isCmd(toks[i])) { x = next(); pts.push([x, y]); } break;
    case 'h': while (i < toks.length && !isCmd(toks[i])) { x += next(); pts.push([x, y]); } break;
    case 'V': while (i < toks.length && !isCmd(toks[i])) { y = next(); pts.push([x, y]); } break;
    case 'v': while (i < toks.length && !isCmd(toks[i])) { y += next(); pts.push([x, y]); } break;
    case 'C': while (i < toks.length && !isCmd(toks[i])) { next(); next(); next(); next(); x = next(); y = next(); pts.push([x, y]); } break;
    case 'c': while (i < toks.length && !isCmd(toks[i])) { next(); next(); next(); next(); x += next(); y += next(); pts.push([x, y]); } break;
    case 'S': while (i < toks.length && !isCmd(toks[i])) { next(); next(); x = next(); y = next(); pts.push([x, y]); } break;
    case 's': while (i < toks.length && !isCmd(toks[i])) { next(); next(); x += next(); y += next(); pts.push([x, y]); } break;
    case 'Q': while (i < toks.length && !isCmd(toks[i])) { next(); next(); x = next(); y = next(); pts.push([x, y]); } break;
    case 'q': while (i < toks.length && !isCmd(toks[i])) { next(); next(); x += next(); y += next(); pts.push([x, y]); } break;
    case 'T': while (i < toks.length && !isCmd(toks[i])) { x = next(); y = next(); pts.push([x, y]); } break;
    case 't': while (i < toks.length && !isCmd(toks[i])) { x += next(); y += next(); pts.push([x, y]); } break;
    case 'A': while (i < toks.length && !isCmd(toks[i])) { next(); next(); next(); next(); next(); x = next(); y = next(); pts.push([x, y]); } break;
    case 'a': while (i < toks.length && !isCmd(toks[i])) { next(); next(); next(); next(); next(); x += next(); y += next(); pts.push([x, y]); } break;
    case 'Z': case 'z': x = sx; y = sy; break;
  }
}

console.log('#  idx      x       y     Δfrom-prev   straight?');
let prev = null;
for (let k = 0; k < pts.length; k++) {
  const [px, py] = pts[k];
  let meta = '';
  if (prev) {
    const dx = px - prev[0];
    const dy = py - prev[1];
    const dist = Math.hypot(dx, dy);
    meta = ` Δ=${dist.toFixed(1).padStart(6)} angle=${((Math.atan2(-dy, dx) * 180 / Math.PI).toFixed(1)).padStart(6)}°`;
    if (dist > 60) meta += '   ← LONG (likely straight)';
  }
  console.log(`  ${String(k).padStart(3)} ${px.toFixed(1).padStart(7)} ${py.toFixed(1).padStart(7)}${meta}`);
  prev = pts[k];
}
