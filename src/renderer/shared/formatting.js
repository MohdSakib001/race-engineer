export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function fmt(ms) {
  if (!ms || ms === 0) return '-:--.---';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export function fmtSector(ms) {
  if (!ms || ms === 0) return '--.---';
  const seconds = Math.floor(ms / 1000);
  const millis = ms % 1000;
  return `${seconds}.${String(millis).padStart(3, '0')}`;
}

export function computeSector3Time(lap) {
  if (!lap) return 0;
  const sector3Ms = (lap.lastLapTimeMs || 0) - (lap.sector1TimeMs || 0) - (lap.sector2TimeMs || 0);
  return sector3Ms > 0 ? sector3Ms : 0;
}

export function fmtCountdown(sec) {
  if (!sec || sec <= 0) return '0:00';
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function csvEscape(value) {
  const raw = String(value ?? '');
  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

export function safeFilePart(value, fallback = 'session') {
  const cleaned = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}
