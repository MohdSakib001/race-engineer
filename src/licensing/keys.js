import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import {
  postLicenseWorker,
  registerLicenseWithWorker,
} from '../services/license-worker/index.js';
import {
  DEV_SESSION_CREDITS,
  WORKER_ADMIN_SECRET,
  WORKER_URL,
  isDevMode,
} from './env.js';
import { getResolvedCreditsRemaining } from './store.js';

export function getMachineId(userDataPath) {
  if (userDataPath) {
    const idFile = `${userDataPath}/machine-id`;
    try {
      const existing = fs.readFileSync(idFile, 'utf8').trim();
      if (existing && existing.length >= 8) return existing;
    } catch {}
    const id = crypto.randomBytes(16).toString('hex');
    try { fs.writeFileSync(idFile, id, 'utf8'); } catch {}
    return id;
  }
  return crypto.createHash('sha256').update(os.hostname()).digest('hex').slice(0, 32);
}

export function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `RE-${seg()}-${seg()}-${seg()}`;
}

export function generateLicenseKeyFromOrder(orderId) {
  const seed = String(orderId || '').trim();
  if (!seed) return generateLicenseKey();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const digest = crypto.createHash('sha256').update(`race-engineer:${seed}`).digest();
  let code = '';
  for (let i = 0; code.length < 12; i++) {
    code += chars[digest[i % digest.length] % chars.length];
  }
  return `RE-${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
}

async function workerPost(endpoint, body) {
  if (!WORKER_URL) {
    return {
      error: 'License server not configured (WORKER_URL missing).',
      code: 'LICENSE_SERVER_UNAVAILABLE',
    };
  }
  try {
    return await postLicenseWorker({
      baseUrl: WORKER_URL,
      endpoint,
      body,
    });
  } catch (e) {
    return {
      error: `License server unreachable: ${e.message}`,
      code: 'LICENSE_SERVER_UNREACHABLE',
    };
  }
}

export async function registerLicenseKey(licenseKey, pack, stripeTxId) {
  if (isDevMode()) return { success: true };
  if (!WORKER_URL) return { success: false, error: 'WORKER_URL not set' };
  try {
    return await registerLicenseWithWorker({
      baseUrl: WORKER_URL,
      adminSecret: WORKER_ADMIN_SECRET,
      licenseKey,
      pack,
      stripeTxId,
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function activateLicenseKey(licenseKey, machineId, machineLabel) {
  if (isDevMode() || String(licenseKey || '').startsWith('RE-DEV-')) {
    const parts = String(licenseKey || '').split('-');
    const packCount = parseInt(parts[3] || parts[2] || '1', 10) || 1;
    return {
      success: true,
      packType: 'session',
      packCount,
      packId: 'dev_session',
      mode: 'dev',
      creditsRemaining: DEV_SESSION_CREDITS,
      racesRemaining: DEV_SESSION_CREDITS,
      qualifyingRemaining: DEV_SESSION_CREDITS,
      exhausted: false,
    };
  }
  const result = await workerPost('/activate', { licenseKey, machineId, machineLabel });
  if (result.error) return { success: false, error: result.error };
  const creditsRemaining = getResolvedCreditsRemaining(result);
  return {
    success: true,
    ...result,
    creditsRemaining,
    racesRemaining: creditsRemaining,
    qualifyingRemaining: creditsRemaining,
  };
}

export async function validateLicenseKey(licenseKey, machineId) {
  if (isDevMode() || String(licenseKey || '').startsWith('RE-DEV-')) {
    const parts = String(licenseKey || '').split('-');
    const packCount = parseInt(parts[3] || parts[2] || '1', 10) || 1;
    return {
      valid: true,
      packType: 'session',
      packCount,
      creditsRemaining: DEV_SESSION_CREDITS,
      racesRemaining: DEV_SESSION_CREDITS,
      qualifyingRemaining: DEV_SESSION_CREDITS,
      exhausted: false,
    };
  }
  const result = await workerPost('/validate', { licenseKey, machineId });
  if (result?.valid === true) {
    const creditsRemaining = getResolvedCreditsRemaining(result);
    return {
      ...result,
      creditsRemaining,
      racesRemaining: creditsRemaining,
      qualifyingRemaining: creditsRemaining,
    };
  }
  return result;
}

export async function consumeLicenseKeyCredit(licenseKey, machineId, sessionType = 'race') {
  if (isDevMode() || String(licenseKey || '').startsWith('RE-DEV-')) {
    return {
      success: true,
      creditsRemaining: DEV_SESSION_CREDITS,
      racesRemaining: DEV_SESSION_CREDITS,
      qualifyingRemaining: DEV_SESSION_CREDITS,
      exhausted: false,
      mode: 'dev',
    };
  }
  const result = await workerPost('/consume', { licenseKey, machineId, sessionType });
  if (result?.success) {
    const creditsRemaining = getResolvedCreditsRemaining(result);
    return {
      ...result,
      creditsRemaining,
      racesRemaining: creditsRemaining,
      qualifyingRemaining: creditsRemaining,
    };
  }
  if (result && (Number.isFinite(Number(result?.racesRemaining)) || Number.isFinite(Number(result?.qualifyingRemaining)) || Number.isFinite(Number(result?.creditsRemaining)))) {
    const creditsRemaining = getResolvedCreditsRemaining(result);
    return {
      ...result,
      creditsRemaining,
      racesRemaining: creditsRemaining,
      qualifyingRemaining: creditsRemaining,
    };
  }
  return result;
}

export async function refundLicenseKeyCredit(licenseKey, machineId, sessionType = 'race') {
  if (isDevMode() || String(licenseKey || '').startsWith('RE-DEV-')) {
    return {
      success: true,
      creditsRemaining: DEV_SESSION_CREDITS,
      racesRemaining: DEV_SESSION_CREDITS,
      qualifyingRemaining: DEV_SESSION_CREDITS,
      exhausted: false,
      mode: 'dev',
    };
  }
  const result = await workerPost('/refund', { licenseKey, machineId, sessionType });
  if (result?.success) {
    const creditsRemaining = getResolvedCreditsRemaining(result);
    return {
      ...result,
      creditsRemaining,
      racesRemaining: creditsRemaining,
      qualifyingRemaining: creditsRemaining,
    };
  }
  return result;
}

export async function deactivateLicenseKey(licenseKey, machineId) {
  if (isDevMode()) return { success: true };
  return workerPost('/deactivate', { licenseKey, machineId });
}

export async function attachLicenseKeyToPayment(sessionId, licenseKey, pack) {
  return { success: true };
}

export async function lookupLicenseKey(licenseKey) {
  if (isDevMode() || String(licenseKey || '').startsWith('RE-DEV-')) {
    const parts = String(licenseKey || '').split('-');
    const count = parseInt(parts[3] || parts[2] || '1', 10) || 1;
    return {
      found: true,
      paid: true,
      packType: 'session',
      packCount: count,
      packId: 'dev_session',
      txId: licenseKey,
    };
  }
  return { found: false, error: 'Use activateLicenseKey() instead.' };
}

