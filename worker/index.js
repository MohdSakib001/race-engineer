/**
 * Race Engineer - License Redemption Worker
 *
 * KV key: lic:{licenseKey}
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

const DEV_SESSION_CREDITS = 999;

function parseDevKey(licenseKey) {
  const parts = String(licenseKey || '').split('-');
  const packCount = parseInt(parts[3] || parts[2] || '1', 10) || 1;
  return { packType: 'session', packCount };
}

function resolveLegacyCredits(primaryValue, secondaryValue, packType) {
  const primary = Number(primaryValue);
  const secondary = Number(secondaryValue);
  const hasPrimary = Number.isFinite(primary);
  const hasSecondary = Number.isFinite(secondary);

  if (hasPrimary && hasSecondary) {
    if (String(packType || '').toLowerCase() === 'session' && primary === secondary) {
      return Math.max(0, primary);
    }
    return Math.max(0, primary + secondary);
  }
  if (hasPrimary) return Math.max(0, primary);
  if (hasSecondary) return Math.max(0, secondary);
  return 0;
}

function normalizeRecord(record) {
  if (!record) return null;

  const explicitTotal = Number(record.sessionCreditsTotal);
  const explicitRemaining = Number(record.sessionCreditsRemaining);
  const inferredTotal = resolveLegacyCredits(record.raceCreditsTotal, record.qualifyingCreditsTotal, record.packType);
  const inferredRemaining = resolveLegacyCredits(record.raceCreditsRemaining, record.qualifyingCreditsRemaining, record.packType);
  const sessionTotal = Number.isFinite(explicitTotal)
    ? Math.max(0, explicitTotal)
    : Math.max(0, inferredTotal || Number(record.packCount) || 0);
  const sessionRemaining = Number.isFinite(explicitRemaining)
    ? Math.max(0, explicitRemaining)
    : Math.max(0, inferredRemaining || sessionTotal);

  record.packType = 'session';
  record.packCount = Math.max(0, Number(record.packCount) || sessionTotal || 0);
  record.sessionCreditsTotal = Math.max(0, sessionTotal);
  record.sessionCreditsRemaining = Math.min(record.sessionCreditsTotal, Math.max(0, sessionRemaining));
  record.raceCreditsTotal = record.sessionCreditsTotal;
  record.qualifyingCreditsTotal = record.sessionCreditsTotal;
  record.raceCreditsRemaining = record.sessionCreditsRemaining;
  record.qualifyingCreditsRemaining = record.sessionCreditsRemaining;
  if (!Array.isArray(record.activations)) record.activations = [];
  if (!record.maxActivations) record.maxActivations = 2;

  const exhausted = record.sessionCreditsRemaining <= 0;
  if (exhausted && !record.exhaustedAt) record.exhaustedAt = new Date().toISOString();
  if (!exhausted) record.exhaustedAt = null;

  return record;
}

function licensePayload(record, extras = {}) {
  const normalized = normalizeRecord(record);
  return {
    ...extras,
    packType: normalized.packType,
    packCount: normalized.packCount,
    packId: normalized.packId,
    creditsRemaining: normalized.sessionCreditsRemaining,
    racesRemaining: normalized.sessionCreditsRemaining,
    qualifyingRemaining: normalized.sessionCreditsRemaining,
    exhausted: normalized.sessionCreditsRemaining <= 0,
    exhaustedAt: normalized.exhaustedAt || null,
    activationsUsed: normalized.activations.length,
    maxActivations: normalized.maxActivations,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (request.method !== 'POST') {
      return err('Method not allowed', 405);
    }

    const url = new URL(request.url);
    let body;
    try {
      body = await request.json();
    } catch {
      return err('Invalid JSON body');
    }

    if (url.pathname === '/register') {
      const adminSecret = request.headers.get('X-Admin-Secret');
      if (!adminSecret || adminSecret !== env.ADMIN_SECRET) {
        return err('Unauthorized', 401);
      }

      const { licenseKey, packId, packType, packCount, stripeTxId, stripePaymentIntentId } = body;
      if (!licenseKey || !packType || !packCount) {
        return err('Missing required fields');
      }

      const kvKey = `lic:${licenseKey}`;
      const existing = await env.LICENSE_KV.get(kvKey, 'json');
      if (existing) {
        return err('License key already registered');
      }

      const record = normalizeRecord({
        licenseKey,
        packId: packId || `session_${packCount}`,
        packType: 'session',
        packCount: Number(packCount),
        sessionCreditsTotal: Math.max(0, Number(packCount) || 0),
        sessionCreditsRemaining: Math.max(0, Number(packCount) || 0),
        exhaustedAt: null,
        stripeTxId: stripeTxId || null,
        stripePaymentIntentId: stripePaymentIntentId || null,
        registeredAt: new Date().toISOString(),
        activations: [],
        maxActivations: 2,
      });

      await env.LICENSE_KV.put(kvKey, JSON.stringify(record));
      return json({ success: true, licenseKey, ...licensePayload(record) });
    }

    if (url.pathname === '/activate') {
      const { licenseKey, machineId, machineLabel } = body;
      if (!licenseKey || !machineId) {
        return err('Missing licenseKey or machineId');
      }

      if (String(licenseKey).startsWith('RE-DEV-')) {
        const { packType, packCount } = parseDevKey(licenseKey);
        return json({
          success: true,
          mode: 'dev',
          packType,
          packCount,
          creditsRemaining: DEV_SESSION_CREDITS,
          racesRemaining: DEV_SESSION_CREDITS,
          qualifyingRemaining: DEV_SESSION_CREDITS,
          exhausted: false,
          exhaustedAt: null,
        });
      }

      const kvKey = `lic:${licenseKey}`;
      const record = normalizeRecord(await env.LICENSE_KV.get(kvKey, 'json'));
      if (!record) {
        return err('License key not found. Check the key and try again.');
      }

      const existingSlot = record.activations.find(a => a.machineId === machineId);
      if (existingSlot) {
        existingSlot.lastSeen = new Date().toISOString();
        await env.LICENSE_KV.put(kvKey, JSON.stringify(record));
        return json(licensePayload(record, { success: true, mode: 'reactivated' }));
      }

      if (record.activations.length >= record.maxActivations) {
        return err(
          `This license key is already active on ${record.maxActivations} machine(s). ` +
          'Deactivate an existing machine first, or contact support.'
        );
      }

      record.activations.push({
        machineId,
        machineLabel: machineLabel || 'Unknown',
        activatedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      });
      await env.LICENSE_KV.put(kvKey, JSON.stringify(record));
      return json(licensePayload(record, { success: true, mode: 'activated' }));
    }

    if (url.pathname === '/validate') {
      const { licenseKey, machineId } = body;
      if (!licenseKey || !machineId) {
        return err('Missing licenseKey or machineId');
      }

      if (String(licenseKey).startsWith('RE-DEV-')) {
        const { packType, packCount } = parseDevKey(licenseKey);
        return json({
          valid: true,
          packType,
          packCount,
          creditsRemaining: DEV_SESSION_CREDITS,
          racesRemaining: DEV_SESSION_CREDITS,
          qualifyingRemaining: DEV_SESSION_CREDITS,
          exhausted: false,
          exhaustedAt: null,
        });
      }

      const kvKey = `lic:${licenseKey}`;
      const record = normalizeRecord(await env.LICENSE_KV.get(kvKey, 'json'));
      if (!record) {
        return json({ valid: false, reason: 'Key not found' });
      }

      const slot = record.activations.find(a => a.machineId === machineId);
      if (!slot) {
        return json({ valid: false, reason: 'Not activated on this machine' });
      }

      slot.lastSeen = new Date().toISOString();
      await env.LICENSE_KV.put(kvKey, JSON.stringify(record));
      return json({ valid: true, ...licensePayload(record) });
    }

    if (url.pathname === '/consume') {
      const { licenseKey, machineId, sessionType } = body;
      if (!licenseKey || !machineId || !sessionType) {
        return err('Missing licenseKey, machineId or sessionType');
      }

      if (String(licenseKey).startsWith('RE-DEV-')) {
        return json({
          success: true,
          mode: 'dev',
          sessionType: String(sessionType).toLowerCase() === 'qualifying' ? 'qualifying' : 'race',
          creditsRemaining: DEV_SESSION_CREDITS,
          racesRemaining: DEV_SESSION_CREDITS,
          qualifyingRemaining: DEV_SESSION_CREDITS,
          exhausted: false,
          exhaustedAt: null,
        });
      }

      const kvKey = `lic:${licenseKey}`;
      const record = normalizeRecord(await env.LICENSE_KV.get(kvKey, 'json'));
      if (!record) {
        return err('License key not found. Check the key and try again.');
      }

      const slot = record.activations.find(a => a.machineId === machineId);
      if (!slot) {
        return err('License key is not activated on this machine.');
      }

      const normalizedSessionType = String(sessionType).toLowerCase() === 'qualifying' ? 'qualifying' : 'race';
      if (record.sessionCreditsRemaining <= 0) {
        return json({
          success: false,
          code: 'NO_CREDITS',
          error: 'No credits remaining on this license key.',
          ...licensePayload(record),
        }, 409);
      }
      record.sessionCreditsRemaining -= 1;

      record.lastConsumedAt = new Date().toISOString();
      slot.lastSeen = record.lastConsumedAt;
      normalizeRecord(record);
      await env.LICENSE_KV.put(kvKey, JSON.stringify(record));
      return json({
        success: true,
        sessionType: normalizedSessionType,
        ...licensePayload(record),
      });
    }

    if (url.pathname === '/refund') {
      const { licenseKey, machineId, sessionType } = body;
      if (!licenseKey || !machineId || !sessionType) {
        return err('Missing licenseKey, machineId or sessionType');
      }

      if (String(licenseKey).startsWith('RE-DEV-')) {
        return json({
          success: true,
          mode: 'dev',
          sessionType: String(sessionType).toLowerCase() === 'qualifying' ? 'qualifying' : 'race',
          creditsRemaining: DEV_SESSION_CREDITS,
          racesRemaining: DEV_SESSION_CREDITS,
          qualifyingRemaining: DEV_SESSION_CREDITS,
          exhausted: false,
          exhaustedAt: null,
        });
      }

      const kvKey = `lic:${licenseKey}`;
      const record = normalizeRecord(await env.LICENSE_KV.get(kvKey, 'json'));
      if (!record) {
        return err('License key not found. Check the key and try again.');
      }

      const slot = record.activations.find(a => a.machineId === machineId);
      if (!slot) {
        return err('License key is not activated on this machine.');
      }

      const normalizedSessionType = String(sessionType).toLowerCase() === 'qualifying' ? 'qualifying' : 'race';
      const total = Math.max(0, Number(record.sessionCreditsTotal) || 0);
      record.sessionCreditsRemaining = Math.min(total, (Number(record.sessionCreditsRemaining) || 0) + 1);

      record.lastRefundedAt = new Date().toISOString();
      slot.lastSeen = record.lastRefundedAt;
      normalizeRecord(record);
      await env.LICENSE_KV.put(kvKey, JSON.stringify(record));
      return json({
        success: true,
        sessionType: normalizedSessionType,
        ...licensePayload(record),
      });
    }

    if (url.pathname === '/deactivate') {
      const { licenseKey, machineId } = body;
      if (!licenseKey || !machineId) {
        return err('Missing licenseKey or machineId');
      }

      const kvKey = `lic:${licenseKey}`;
      const record = normalizeRecord(await env.LICENSE_KV.get(kvKey, 'json'));
      if (!record) {
        return err('License key not found');
      }

      const before = record.activations.length;
      record.activations = record.activations.filter(a => a.machineId !== machineId);
      if (record.activations.length === before) {
        return err('This machine was not found in the activation list');
      }

      await env.LICENSE_KV.put(kvKey, JSON.stringify(record));
      return json({
        success: true,
        activationsRemaining: record.maxActivations - record.activations.length,
      });
    }

    return err('Unknown endpoint', 404);
  },
};
