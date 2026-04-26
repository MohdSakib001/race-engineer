/**
 * Bundled Team Telemetry 25 track data, loaded at build time via Vite's
 * `import.meta.glob`. The CSVs ship as part of this repo (see the
 * attribution README at `assets/tt-tracks/README.md`).
 *
 * Format reminders (TT spec):
 *   Track_<id>.csv:  `distance;X;Z;0`   (5000+ rows per track)
 *   Box_<id>.csv:    `distance;X;Z`     (pit lane)
 *   Description/Track_Settings_<id>.csv: `key;value` pairs
 */

const TRACK_RAW = import.meta.glob('../assets/tt-tracks/Track_*.csv', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

const BOX_RAW = import.meta.glob('../assets/tt-tracks/Box_*.csv', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

const SETTINGS_RAW = import.meta.glob(
  '../assets/tt-tracks/Description/Track_Settings_*.csv',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

export interface TtTrack {
  trackId: number;
  /** Human-readable track name parsed from the settings file's first
   *  line (`Settings for Track-ID <id> <name>;<id>`). Falls back to
   *  "Track <id>" if the settings file is missing or malformed. */
  name: string;
  racingLine: [number, number][];
  /** TT's first CSV column — cumulative lap distance in TT units (cm).
   *  Same length as `racingLine`. Used for distance-based lookups. */
  racingLineDist: number[];
  pitLane: [number, number][];
  /** First-column lap-distance values (cm) for each pit-lane sample.
   *  Same length as `pitLane`. Used to project a car into TT's pit-lane
   *  geometry by their live `lapDistance`. */
  pitLaneDist: number[];
  settings: Record<string, number | string | boolean>;
  bbox: { minX: number; maxX: number; minZ: number; maxZ: number };
  pathLength: number;
}

const cache = new Map<number, TtTrack | null>();

function indexById(map: Record<string, string>, prefix: RegExp): Map<number, string> {
  const out = new Map<number, string>();
  for (const [path, raw] of Object.entries(map)) {
    const m = path.match(prefix);
    if (!m) continue;
    out.set(Number(m[1]), raw);
  }
  return out;
}

const TRACKS = indexById(TRACK_RAW, /Track_(\d+)\.csv$/);
const BOXES = indexById(BOX_RAW, /Box_(\d+)\.csv$/);
const SETTINGS = indexById(SETTINGS_RAW, /Track_Settings_(\d+)\.csv$/);

function parseXzCsv(text: string): { points: [number, number][]; distances: number[] } {
  const points: [number, number][] = [];
  const distances: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const parts = line.split(';');
    if (parts.length < 3) continue;
    const d = parseFloat(parts[0]);
    const x = parseFloat(parts[1]);
    const z = parseFloat(parts[2]);
    if (Number.isFinite(x) && Number.isFinite(z)) {
      points.push([x, z]);
      distances.push(Number.isFinite(d) ? d : 0);
    }
  }
  return { points, distances };
}

function parseSettings(text: string): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('!') || i === 0) continue;
    const sep = line.indexOf(';');
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (!key) continue;
    if (/^-?\d+(\.\d+)?$/.test(value)) out[key] = parseFloat(value);
    else if (value.toLowerCase() === 'true') out[key] = true;
    else if (value.toLowerCase() === 'false') out[key] = false;
    else out[key] = value;
  }
  return out;
}

/** Authoritative F1 25 track-id → display name map. We can't trust TT's
 *  settings files for this — TT ships `Track_Settings_31.csv` and
 *  `_32.csv` as byte-identical copies of `_30.csv`, so all three would
 *  resolve to "Miami" if we parsed the first line. The track DATA is
 *  correct in those files, only the metadata is wrong. */
const F1_25_TRACK_NAMES: Record<number, string> = {
  0:  'Melbourne',
  1:  'Paul Ricard',
  2:  'Shanghai',
  3:  'Bahrain',
  4:  'Catalunya',
  5:  'Monaco',
  6:  'Montreal',
  7:  'Silverstone',
  8:  'Hockenheim',
  9:  'Hungaroring',
  10: 'Spa',
  11: 'Monza',
  12: 'Singapore',
  13: 'Suzuka',
  14: 'Abu Dhabi',
  15: 'Austin',
  16: 'Interlagos',
  17: 'Spielberg',
  18: 'Sochi',
  19: 'Mexico City',
  20: 'Baku',
  21: 'Sakhir Short',
  22: 'Silverstone Short',
  23: 'Austin Short',
  24: 'Suzuka Short',
  25: 'Hanoi',
  26: 'Zandvoort',
  27: 'Imola',
  28: 'Portimao',
  29: 'Jeddah',
  30: 'Miami',
  31: 'Las Vegas',
  32: 'Losail',
  39: 'Silverstone (reverse)',
  40: 'Austria (reverse)',
  41: 'Zandvoort (reverse)',
};

function trackNameFor(id: number): string {
  return F1_25_TRACK_NAMES[id] ?? `Track ${id}`;
}

export function hasTtTrack(trackId: number | undefined): boolean {
  return trackId != null && TRACKS.has(trackId);
}

export function loadTtTrack(trackId: number): TtTrack | null {
  if (cache.has(trackId)) return cache.get(trackId) ?? null;
  const trackRaw = TRACKS.get(trackId);
  if (!trackRaw) { cache.set(trackId, null); return null; }
  const track = parseXzCsv(trackRaw);
  if (track.points.length < 4) { cache.set(trackId, null); return null; }
  const pit = parseXzCsv(BOXES.get(trackId) ?? '');
  const settings = parseSettings(SETTINGS.get(trackId) ?? '');

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of track.points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  let pathLength = 0;
  for (let i = 1; i < track.points.length; i++) {
    const dx = track.points[i][0] - track.points[i - 1][0];
    const dz = track.points[i][1] - track.points[i - 1][1];
    pathLength += Math.hypot(dx, dz);
  }

  const name = trackNameFor(trackId);

  const out: TtTrack = {
    trackId, name,
    racingLine: track.points,
    racingLineDist: track.distances,
    pitLane: pit.points,
    pitLaneDist: pit.distances,
    settings,
    bbox: { minX, maxX, minZ, maxZ }, pathLength,
  };
  cache.set(trackId, out);
  return out;
}

/** Find the pit-lane sample whose recorded lap-distance is nearest to
 *  the given `distTtUnits` (cm). Used to project a car onto TT's actual
 *  pit-lane geometry while it's in pit, instead of trusting raw motion
 *  (which can drift off TT's recorded line by a few metres).
 *
 *  Returns `null` if the track has no pit-lane data, or if `distTtUnits`
 *  is outside the recorded range (i.e. the car's lap distance doesn't
 *  fall on any portion of the recorded pit drive — likely on track,
 *  not actually in pit). */
export function nearestPitSampleByDistance(
  track: TtTrack, distTtUnits: number,
): { idx: number; point: [number, number] } | null {
  const arr = track.pitLaneDist;
  if (arr.length === 0) return null;
  let bestI = 0, bestD = Infinity;
  // Wrap-aware: TT pit recordings often cross the start/finish line, so
  // compare distance modulo 1 lap (~ trackLength × 100 cm). We compute
  // an effective "match" as the smaller of forward/backward distance
  // around the lap boundary.
  const trackLengthCm = (track.settings.TrackLength as number ?? 0) * 100;
  const lapMod = trackLengthCm > 0 ? trackLengthCm : null;
  for (let i = 0; i < arr.length; i++) {
    let d = Math.abs(arr[i] - distTtUnits);
    if (lapMod) d = Math.min(d, lapMod - d);
    if (d < bestD) { bestD = d; bestI = i; }
  }
  // If the closest sample is more than half a lap away, the car isn't
  // really in TT's pit-lane region — caller should fall back to motion.
  if (lapMod && bestD > lapMod * 0.4) return null;
  return { idx: bestI, point: track.pitLane[bestI] };
}

/** Returns every track id that has bundled TT data, plus the parsed
 *  human-readable name. Sorted by name (case-insensitive). Used by the
 *  TrackMap "browse mode" dropdown so users can preview a circuit
 *  without an active F1 25 session. */
export function listTtTracks(): { trackId: number; name: string }[] {
  const out: { trackId: number; name: string }[] = [];
  for (const id of TRACKS.keys()) {
    const t = loadTtTrack(id);
    if (t) out.push({ trackId: id, name: t.name });
  }
  out.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return out;
}

/** Binary-search the racing line for the row whose cumulative distance
 *  is nearest to `distTtUnits`. */
export function nearestSampleByDistance(
  track: TtTrack, distTtUnits: number,
): { idx: number; point: [number, number] } {
  const arr = track.racingLineDist;
  if (arr.length === 0) return { idx: 0, point: track.racingLine[0] };
  // Linear scan is fine — one lookup per car per render, arrays ~5000 long
  let bestI = 0, bestD = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(arr[i] - distTtUnits);
    if (d < bestD) { bestD = d; bestI = i; }
  }
  return { idx: bestI, point: track.racingLine[bestI] };
}
