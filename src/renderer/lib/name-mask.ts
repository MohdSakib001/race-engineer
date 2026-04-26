import type { DriverNameMask } from '../../shared/types/store';

/**
 * Apply user-configured driver-name masks in order.
 * Patterns are treated as case-insensitive regex. Invalid patterns are skipped.
 */
export function applyNameMasks(name: string, masks: DriverNameMask[] | undefined): string {
  if (!name || !masks || masks.length === 0) return name;
  let out = name;
  for (const m of masks) {
    if (!m.pattern) continue;
    try {
      const re = new RegExp(m.pattern, 'gi');
      out = out.replace(re, m.replace ?? '');
    } catch {
      // invalid regex — skip
    }
  }
  return out.trim() || name;
}
