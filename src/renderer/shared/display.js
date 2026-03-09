export function formatGearValue(gear) {
  return gear <= 0 ? (gear === 0 ? 'N' : 'R') : String(gear);
}

export function tyreClass(tempC) {
  if (tempC < 50) return 'temp-cold';
  if (tempC < 70) return 'temp-cool';
  if (tempC < 90) return 'temp-opt';
  if (tempC < 110) return 'temp-warm';
  if (tempC < 130) return 'temp-hot';
  return 'temp-vhot';
}

export function dmgClass(pct) {
  if (pct < 25) return 'dmg-low';
  if (pct < 50) return 'dmg-mid';
  if (pct < 75) return 'dmg-high';
  return 'dmg-crit';
}

export function weatherIcon(weatherCode) {
  const icons = { 0: 'SUN', 1: 'CLEAR', 2: 'CLOUD', 3: 'RAIN', 4: 'HEAVY', 5: 'STORM' };
  return icons[weatherCode] || 'N/A';
}

export function safetyCarLabel(status) {
  const labels = { 0: '', 1: 'SC', 2: 'VSC', 3: 'SC Ending' };
  return labels[status] || '';
}
