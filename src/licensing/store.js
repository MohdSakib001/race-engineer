import fs from 'node:fs';
import { DEV_SESSION_CREDITS, isDevMode } from './env.js';

const DEFAULT_LICENSE = {
  creditsRemaining: 0,
  racesRemaining: 0,
  qualifyingRemaining: 0,
  devMode: false,
  byokMode: false,
  purchases: [],
  paymentEvents: [],
  processedOrderIds: [],
  licenseStatus: 'no-key',
  licenseExhaustedAt: null,
  lastIssuedLicenseKey: null,
};

function parsePurchaseCount(purchase = {}) {
  const explicit = Number(purchase?.count);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  const packId = String(purchase?.packId || '').trim().toLowerCase();
  const matched = packId.match(/(?:race|credit|session)_(\d+)/);
  if (matched) return Math.max(0, Number.parseInt(matched[1], 10) || 0);
  if (packId === 'qual_short' || packId === 'qual_full') return 1;
  return 0;
}

function getPurchaseCreditUpperBound(purchases = []) {
  if (!Array.isArray(purchases)) return 0;
  return purchases.reduce((sum, purchase) => sum + parsePurchaseCount(purchase), 0);
}

export function getResolvedCreditsRemaining(value = {}) {
  const explicit = Number(value?.creditsRemaining);
  if (Number.isFinite(explicit)) return Math.max(0, Math.floor(explicit));

  const race = Number(value?.racesRemaining);
  const qualifying = Number(value?.qualifyingRemaining);
  const hasRace = Number.isFinite(race);
  const hasQualifying = Number.isFinite(qualifying);

  if (hasRace && hasQualifying) {
    if (race === qualifying) return Math.max(0, Math.floor(race));
    return Math.max(0, Math.floor(race + qualifying));
  }
  if (hasRace) return Math.max(0, Math.floor(race));
  if (hasQualifying) return Math.max(0, Math.floor(qualifying));
  return 0;
}

export function applySharedCreditAliases(target = {}, credits = getResolvedCreditsRemaining(target)) {
  const normalizedCredits = Math.max(0, Math.floor(Number(credits) || 0));
  target.creditsRemaining = normalizedCredits;
  target.racesRemaining = normalizedCredits;
  target.qualifyingRemaining = normalizedCredits;
  return target;
}

function stripStaleDevLicenseState(license = {}) {
  const cleaned = { ...license };
  if (isDevMode()) return cleaned;

  const hadPersistedDevMode = cleaned.devMode === true;
  cleaned.devMode = false;
  const activeKey = String(cleaned.licenseKey || '').trim().toUpperCase();
  const lastKey = String(cleaned.lastIssuedLicenseKey || '').trim().toUpperCase();
  const legacyRace = Math.max(0, Number(cleaned.racesRemaining || 0));
  const legacyQualifying = Math.max(0, Number(cleaned.qualifyingRemaining || 0));
  const legacyTotal = legacyRace + legacyQualifying;
  const purchaseUpperBound = getPurchaseCreditUpperBound(cleaned.purchases);
  const hasExplicitCredits = Number.isFinite(Number(cleaned.creditsRemaining));

  if (hadPersistedDevMode && !activeKey) {
    applySharedCreditAliases(cleaned, 0);
    cleaned.machineId = null;
  }

  if (activeKey.startsWith('RE-DEV-')) {
    cleaned.licenseKey = null;
    cleaned.machineId = null;
    applySharedCreditAliases(cleaned, 0);
  }

  if (!cleaned.licenseKey && lastKey.startsWith('RE-DEV-')) {
    cleaned.lastIssuedLicenseKey = null;
  }

  if (!hasExplicitCredits && activeKey && !activeKey.startsWith('RE-DEV-')) {
    const suspiciousLegacyCredits = legacyRace >= DEV_SESSION_CREDITS
      || legacyQualifying >= DEV_SESSION_CREDITS
      || legacyTotal > 500
      || (purchaseUpperBound > 0 && legacyTotal > purchaseUpperBound);
    if (suspiciousLegacyCredits) {
      applySharedCreditAliases(cleaned, purchaseUpperBound > 0 ? purchaseUpperBound : 0);
    }
  }

  return cleaned;
}

function deriveLicenseStatus(license) {
  if (license.devMode || isDevMode()) return 'dev';
  if (license.byokMode) return 'byok';
  if (!license.licenseKey) return 'no-key';
  if ((license.creditsRemaining || 0) <= 0) return 'exhausted';
  return 'active';
}

function normalizeLicenseShape(license = {}) {
  const merged = stripStaleDevLicenseState({ ...DEFAULT_LICENSE, ...license });
  if (!Array.isArray(merged.purchases)) merged.purchases = [];
  if (!Array.isArray(merged.paymentEvents)) merged.paymentEvents = [];
  if (!Array.isArray(merged.processedOrderIds)) merged.processedOrderIds = [];

  if (merged.devMode || isDevMode()) {
    applySharedCreditAliases(merged, DEV_SESSION_CREDITS);
  } else {
    const credits = getResolvedCreditsRemaining(merged);
    const purchaseUpperBound = getPurchaseCreditUpperBound(merged.purchases);
    const resolvedCredits = purchaseUpperBound > 0 && merged.licenseKey && !String(merged.licenseKey || '').startsWith('RE-DEV-')
      ? Math.min(credits, purchaseUpperBound)
      : credits;
    applySharedCreditAliases(merged, resolvedCredits);
  }

  const status = deriveLicenseStatus(merged);
  merged.licenseStatus = status;
  if (status === 'exhausted') {
    merged.licenseExhaustedAt = merged.licenseExhaustedAt || new Date().toISOString();
  } else {
    merged.licenseExhaustedAt = null;
  }
  return merged;
}

export function loadLicense(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return normalizeLicenseShape(JSON.parse(raw));
  } catch {
    return normalizeLicenseShape({ devMode: isDevMode() });
  }
}

export function saveLicense(filePath, license) {
  const normalized = normalizeLicenseShape(license);
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf8');
}

export function hasCredits(license, sessionType = 'race') {
  if (license.devMode || isDevMode()) return true;
  if (license.byokMode) return true;
  if (!license.licenseKey) return false;
  return (license.creditsRemaining || 0) > 0;
}

export function consumeCredit(license, sessionType = 'race') {
  if (license.devMode || isDevMode() || license.byokMode) return license;
  const updated = { ...license };
  const nextCredits = Math.max(0, getResolvedCreditsRemaining(updated) - 1);
  return applySharedCreditAliases(updated, nextCredits);
}

export function applyPurchase(license, pack, txId, meta = {}) {
  const updated = normalizeLicenseShape({ ...license });
  applySharedCreditAliases(updated, getResolvedCreditsRemaining(updated) + Math.max(0, Number(pack?.count) || 0));
  updated.purchases = [
    ...(updated.purchases || []),
    {
      date: new Date().toISOString(),
      packId: pack.id,
      count: Math.max(0, Number(pack?.count) || 0),
      type: pack.type || 'session',
      amount: meta.amount || pack.priceDisplay,
      txId,
      provider: meta.provider || null,
      currencyCode: meta.currencyCode || pack.currencyCode || null,
    },
  ];
  updated.licenseStatus = deriveLicenseStatus(updated);
  if (updated.licenseStatus !== 'exhausted') updated.licenseExhaustedAt = null;
  return normalizeLicenseShape(updated);
}

export function recordPaymentEvent(license, event = {}) {
  const updated = normalizeLicenseShape({ ...license });
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    provider: event.provider || null,
    stage: event.stage || 'info',
    level: event.level || 'info',
    message: event.message || '',
    orderId: event.orderId || null,
    packId: event.packId || null,
    txId: event.txId || null,
    status: event.status || null,
    licenseKey: event.licenseKey || null,
  };
  updated.paymentEvents = [...(updated.paymentEvents || []), entry].slice(-120);
  if (entry.licenseKey) updated.lastIssuedLicenseKey = entry.licenseKey;
  return normalizeLicenseShape(updated);
}

