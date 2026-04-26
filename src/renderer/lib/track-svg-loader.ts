/**
 * Loader for the vendored julesr0y track SVGs.
 *
 * Vite's `import.meta.glob('*.svg', { as: 'raw' })` pulls every SVG in the
 * assets folder as a string at build time, so we can parse them on demand
 * without runtime fetching.
 *
 * Each upstream SVG has the same shape:
 *   <svg viewBox="0 0 W H">
 *     <path d="..." stroke-width="20" />   <!-- racing line       -->
 *     <path d="..." />                     <!-- start/finish mark -->
 *     <path d="..." />                     <!-- direction arrow   -->
 *   </svg>
 *
 * We extract the FIRST `<path>` (the racing line) plus the viewBox.
 */

const RAW = import.meta.glob('../assets/track-svgs/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface TrackSvg {
  trackId: number;
  viewBox: string;
  /** The d="" attribute of the racing-line path. */
  racingLine: string;
}

const cache = new Map<number, TrackSvg | null>();

function buildIndex(): Map<number, string> {
  const idx = new Map<number, string>();
  for (const [path, raw] of Object.entries(RAW)) {
    const m = path.match(/(\d+)\.svg$/);
    if (!m) continue;
    idx.set(Number(m[1]), raw);
  }
  return idx;
}
const INDEX = buildIndex();

const VIEWBOX_RE = /viewBox=["']([^"']+)["']/i;
const PATH_D_RE  = /<path[^>]*\sd=["']([^"']+)["']/i;

export function loadTrackSvg(trackId: number): TrackSvg | null {
  if (cache.has(trackId)) return cache.get(trackId) ?? null;
  const raw = INDEX.get(trackId);
  if (!raw) { cache.set(trackId, null); return null; }
  const vb = raw.match(VIEWBOX_RE)?.[1] ?? '0 0 500 500';
  const d = raw.match(PATH_D_RE)?.[1];
  if (!d) { cache.set(trackId, null); return null; }
  const out: TrackSvg = { trackId, viewBox: vb, racingLine: d };
  cache.set(trackId, out);
  return out;
}

export function hasTrackSvg(trackId: number | undefined): boolean {
  if (trackId == null) return false;
  return INDEX.has(trackId);
}
