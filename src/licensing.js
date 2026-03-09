import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';

/**
 * Race Engineer — Licensing & Payment System
 *
 * HYBRID MODEL:
 *   Mode A — BYOK (Bring Your Own Key):
 *     User enters their own OpenAI API key in Settings.
 *     No credits consumed. They pay OpenAI directly.
 *
 *   Mode B — Subscription (your key):
 *     User buys race packs via PayPal (hosted page).
 *     Your OPENAI_API_KEY (env var) is used server-side in main process.
 *     Credits are granted after PayPal payment capture.
 *
 * PRICING:
 *   GPT-4o Realtime: ~$0.06/min audio output (2025 pricing)
 *   Estimate: ~4.8s audio per race-minute × 2.5× markup = ~$0.0125/race-min
 *   Minimum pack price: $0.99 (covers PayPal fees + margin)
 *
 * PAYPAL SETUP (one-time):
 *   1. Create a PayPal Developer app at developer.paypal.com → My Apps & Credentials
 *   2. Copy Client ID and Client Secret → set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET
 *   3. Set YOUR_APP_OPENAI_KEY env var — your OpenAI key for subscription users
 *   No products or price IDs needed — amounts are passed directly per order.
 *
 * DEV MODE:
 *   Set env var RACE_ENGINEER_DEV=1 → unlimited free credits, BYOK skips key check
 */

// ── Your configuration ────────────────────────────────────────────────────────
// __ENV__ is injected at build time by vite.main.config.mjs (reads .env file).
// This avoids runtime dotenv issues with Electron Forge's bundled output.
// eslint-disable-next-line no-undef
const _env = typeof __ENV__ !== 'undefined' ? __ENV__ : {};

export const PAYPAL_CLIENT_ID     = _env.PAYPAL_CLIENT_ID     || '';
export const PAYPAL_CLIENT_SECRET = _env.PAYPAL_CLIENT_SECRET || '';
export const PAYPAL_BASE_URL      = _env.PAYPAL_SANDBOX === '0'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com'; // sandbox by default
export const RAZORPAY_KEY_ID      = _env.RAZORPAY_KEY_ID      || '';
export const RAZORPAY_KEY_SECRET  = _env.RAZORPAY_KEY_SECRET  || '';
export const RAZORPAY_BASE_URL    = 'https://api.razorpay.com/v1';

export const YOUR_APP_OPENAI_KEY = _env.RACE_ENGINEER_OPENAI_KEY || '';

// ── Cloudflare Worker (license redemption backend) ────────────────────────────
export const WORKER_URL = _env.WORKER_URL || '';
export const WORKER_ADMIN_SECRET = _env.WORKER_ADMIN_SECRET || '';

// ── Pricing constants ─────────────────────────────────────────────────────────
const COST_PER_RACE_MINUTE_USD = 0.0125; // after 2.5× markup on OpenAI cost
const QUALIFYING_MINUTES_SHORT = 18;
const QUALIFYING_MINUTES_FULL  = 60;
const MIN_PACK_PRICE_USD = 0.99;
const ZERO_DECIMAL_CURRENCIES = new Set(['HUF', 'JPY', 'TWD']);

const FALLBACK_USD_FX_RATES = {
  USD: 1,
  AUD: 1.52,
  BRL: 5.0,
  CAD: 1.36,
  CHF: 0.88,
  CZK: 23.1,
  DKK: 6.9,
  EUR: 0.92,
  GBP: 0.79,
  HKD: 7.82,
  HUF: 358,
  ILS: 3.67,
  INR: 83,
  JPY: 148,
  MXN: 17.1,
  MYR: 4.7,
  NOK: 10.6,
  NZD: 1.64,
  PHP: 56.2,
  PLN: 3.95,
  SEK: 10.4,
  SGD: 1.35,
  THB: 35.8,
  TWD: 31.5,
};

const PAYPAL_USD_FX_OVERRIDES = (() => {
  const raw = String(_env.PAYPAL_FX_RATES_JSON || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([code, rate]) => [
        String(code || '').trim().toUpperCase(),
        Number(rate),
      ]).filter(([, rate]) => Number.isFinite(rate) && rate > 0),
    );
  } catch {
    return {};
  }
})();

const USD_FX_RATES = { ...FALLBACK_USD_FX_RATES, ...PAYPAL_USD_FX_OVERRIDES };
const ALL_SUPPORTED_CURRENCIES = Object.keys(USD_FX_RATES)
  .map((code) => String(code || '').trim().toUpperCase())
  .filter(Boolean);

const PAYPAL_DEFAULT_CURRENCY = String(_env.PAYPAL_DEFAULT_CURRENCY || 'USD').trim().toUpperCase() || 'USD';
const RAZORPAY_DEFAULT_CURRENCY = String(_env.RAZORPAY_DEFAULT_CURRENCY || 'INR').trim().toUpperCase() || 'INR';

function buildCurrencyList(rawValue, defaultCode) {
  const knownCodes = new Set(ALL_SUPPORTED_CURRENCIES);
  const parsed = String(rawValue || '')
    .split(',')
    .map((code) => String(code || '').trim().toUpperCase())
    .filter((code) => knownCodes.has(code));
  const resolvedDefault = knownCodes.has(defaultCode) ? defaultCode : 'USD';
  const defaults = [resolvedDefault];
  const set = new Set(parsed.length > 0 ? parsed : defaults);
  set.add(resolvedDefault);
  return Array.from(set);
}

const PAYPAL_SUPPORTED_CURRENCIES = (() => {
  const set = new Set(buildCurrencyList(_env.PAYPAL_SUPPORTED_CURRENCIES || '', PAYPAL_DEFAULT_CURRENCY));
  set.add('USD');
  return Array.from(set);
})();

const RAZORPAY_SUPPORTED_CURRENCIES = (() => {
  const set = new Set(buildCurrencyList(_env.RAZORPAY_SUPPORTED_CURRENCIES || '', RAZORPAY_DEFAULT_CURRENCY));
  set.add(RAZORPAY_DEFAULT_CURRENCY);
  return Array.from(set);
})();

function normalizeCurrencyCode(currencyCode, fallback = 'USD', supportedCurrencies = ALL_SUPPORTED_CURRENCIES) {
  const normalized = String(currencyCode || '').trim().toUpperCase();
  if (normalized && supportedCurrencies.includes(normalized)) return normalized;
  if (supportedCurrencies.includes(fallback)) return fallback;
  return 'USD';
}

function normalizePayPalCurrencyCode(currencyCode, fallback = PAYPAL_DEFAULT_CURRENCY) {
  return normalizeCurrencyCode(currencyCode, fallback, PAYPAL_SUPPORTED_CURRENCIES);
}

function normalizeRazorpayCurrencyCode(currencyCode, fallback = RAZORPAY_DEFAULT_CURRENCY) {
  return normalizeCurrencyCode(currencyCode, fallback, RAZORPAY_SUPPORTED_CURRENCIES);
}

function currencyFractionDigits(currencyCode) {
  return ZERO_DECIMAL_CURRENCIES.has(currencyCode) ? 0 : 2;
}

function toCurrencyAmount(amount, currencyCode) {
  const digits = currencyFractionDigits(currencyCode);
  const factor = 10 ** digits;
  const rounded = Math.round(Number(amount || 0) * factor) / factor;
  return Math.max(0, rounded);
}

function toMinorUnits(amount, currencyCode) {
  const code = normalizeCurrencyCode(currencyCode);
  const digits = currencyFractionDigits(code);
  return Math.max(0, Math.round(Number(amount || 0) * (10 ** digits)));
}

function fromMinorUnits(amount, currencyCode) {
  const code = normalizeCurrencyCode(currencyCode);
  const digits = currencyFractionDigits(code);
  return toCurrencyAmount(Number(amount || 0) / (10 ** digits), code);
}

function usdToCurrency(amountUsd, currencyCode) {
  const code = normalizeCurrencyCode(currencyCode);
  const rate = Number(USD_FX_RATES[code] || 1);
  return toCurrencyAmount(Number(amountUsd || 0) * rate, code);
}

function formatCurrency(amount, currencyCode) {
  const code = normalizeCurrencyCode(currencyCode);
  const digits = currencyFractionDigits(code);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number(amount || 0));
  } catch {
    return `${code} ${Number(amount || 0).toFixed(digits)}`;
  }
}

export function getSupportedPayPalCurrencies() {
  return [...PAYPAL_SUPPORTED_CURRENCIES];
}

export function getDefaultPayPalCurrency() {
  return normalizePayPalCurrencyCode(PAYPAL_DEFAULT_CURRENCY, 'USD');
}

export function getSupportedRazorpayCurrencies() {
  return [...RAZORPAY_SUPPORTED_CURRENCIES];
}

export function getDefaultRazorpayCurrency() {
  return normalizeRazorpayCurrencyCode(RAZORPAY_DEFAULT_CURRENCY, 'INR');
}

export function isPayPalConfigured() {
  return !!(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET);
}

export function isRazorpayConfigured() {
  return !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
}

function estimateRaceMinutes(raceLaps, racePercent = 100) {
  const avgLapSeconds = 90;
  return (raceLaps * avgLapSeconds * (racePercent / 100)) / 60;
}

function estimateCostUSD(raceMinutes, activeSituations) {
  const situationMultiplier = 1.0 + Math.min(activeSituations, 70) / 140;
  return raceMinutes * COST_PER_RACE_MINUTE_USD * situationMultiplier;
}

/**
 * Generate race pack options with pricing.
 * @param {{ raceLaps, racePercent, activeSituations }} opts
 */
export function generateRacePacks(opts = {}) {
  const { raceLaps = 58, racePercent = 100, activeSituations = 35, currencyCode } = opts;
  const selectedCurrency = normalizeCurrencyCode(currencyCode);
  const raceMin   = estimateRaceMinutes(raceLaps, racePercent);
  const costPerRace = estimateCostUSD(raceMin, activeSituations);

  const packs = [
    { id: 'race_1',     type: 'race',       count: 1,  label: '1 Race',                   discount: 0,    minutes: raceMin },
    { id: 'race_2',     type: 'race',       count: 2,  label: '2 Races',                  discount: 0.05, minutes: raceMin },
    { id: 'race_5',     type: 'race',       count: 5,  label: '5 Races',                  discount: 0.10, minutes: raceMin },
    { id: 'race_10',    type: 'race',       count: 10, label: '10 Races',                 discount: 0.15, minutes: raceMin },
    { id: 'qual_short', type: 'qualifying', count: 1,  label: 'Qualifying — Short Q',     discount: 0,    minutes: QUALIFYING_MINUTES_SHORT },
    { id: 'qual_full',  type: 'qualifying', count: 1,  label: 'Qualifying — Full Q',      discount: 0,    minutes: QUALIFYING_MINUTES_FULL  },
  ];

  return packs.map(p => {
    const baseCost = p.type === 'qualifying'
      ? estimateCostUSD(p.minutes, activeSituations)
      : costPerRace * p.count;
    const priceUSD = Math.max(baseCost * (1 - p.discount), MIN_PACK_PRICE_USD);
    const convertedPrice = usdToCurrency(priceUSD, selectedCurrency);
    const perRacePrice = p.count > 1 ? toCurrencyAmount(convertedPrice / p.count, selectedCurrency) : null;
    return {
      ...p,
      priceUSD,
      currencyCode: selectedCurrency,
      priceAmount: convertedPrice,
      priceDisplay: formatCurrency(convertedPrice, selectedCurrency),
      perRaceDisplay: p.count > 1 ? `${formatCurrency(perRacePrice, selectedCurrency)}/race` : null,
    };
  });
}

// ── License store ─────────────────────────────────────────────────────────────
const DEFAULT_LICENSE = {
  racesRemaining: 0,
  qualifyingRemaining: 0,
  devMode: false,
  byokMode: false,     // user-provided key, no credits needed
  purchases: [],
  paymentEvents: [],
  processedOrderIds: [],
  licenseStatus: 'no-key',
  licenseExhaustedAt: null,
  lastIssuedLicenseKey: null,
};

function stripStaleDevLicenseState(license = {}) {
  const cleaned = { ...license };
  if (isDevMode()) return cleaned;

  const hadPersistedDevMode = cleaned.devMode === true;
  cleaned.devMode = false;
  const activeKey = String(cleaned.licenseKey || '').trim().toUpperCase();
  const lastKey = String(cleaned.lastIssuedLicenseKey || '').trim().toUpperCase();

  if (hadPersistedDevMode && !activeKey) {
    cleaned.racesRemaining = 0;
    cleaned.qualifyingRemaining = 0;
    cleaned.machineId = null;
  }

  if (activeKey.startsWith('RE-DEV-')) {
    cleaned.licenseKey = null;
    cleaned.machineId = null;
    cleaned.racesRemaining = 0;
    cleaned.qualifyingRemaining = 0;
  }

  if (!cleaned.licenseKey && lastKey.startsWith('RE-DEV-')) {
    cleaned.lastIssuedLicenseKey = null;
  }

  return cleaned;
}

function deriveLicenseStatus(license) {
  if (license.devMode || isDevMode()) return 'dev';
  if (license.byokMode) return 'byok';
  if (!license.licenseKey) return 'no-key';
  if ((license.racesRemaining || 0) <= 0 && (license.qualifyingRemaining || 0) <= 0) return 'exhausted';
  return 'active';
}

function normalizeLicenseShape(license = {}) {
  const merged = stripStaleDevLicenseState({ ...DEFAULT_LICENSE, ...license });
  if (!Array.isArray(merged.purchases)) merged.purchases = [];
  if (!Array.isArray(merged.paymentEvents)) merged.paymentEvents = [];
  if (!Array.isArray(merged.processedOrderIds)) merged.processedOrderIds = [];

  const status = deriveLicenseStatus(merged);
  merged.licenseStatus = status;
  if (status === 'exhausted') {
    merged.licenseExhaustedAt = merged.licenseExhaustedAt || new Date().toISOString();
  } else {
    merged.licenseExhaustedAt = null;
  }
  return merged;
}

export function isDevMode() {
  const runtimeFlag = (typeof process !== 'undefined' && process.env)
    ? process.env.RACE_ENGINEER_DEV
    : '';
  const flag = String(_env.RACE_ENGINEER_DEV || runtimeFlag || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
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

/**
 * Check if user can start a GPT session.
 * BYOK mode and dev mode always pass.
 */
export function hasCredits(license, sessionType = 'race') {
  if (license.devMode || isDevMode()) return true;
  if (license.byokMode) return true; // BYOK: user pays OpenAI directly
  if (!license.licenseKey) return false;
  return sessionType === 'qualifying'
    ? license.qualifyingRemaining > 0
    : license.racesRemaining > 0;
}

export function consumeCredit(license, sessionType = 'race') {
  // BYOK and dev mode don't consume credits
  if (license.devMode || isDevMode() || license.byokMode) return license;
  const updated = { ...license };
  if (sessionType === 'qualifying') {
    updated.qualifyingRemaining = Math.max(0, updated.qualifyingRemaining - 1);
  } else {
    updated.racesRemaining = Math.max(0, updated.racesRemaining - 1);
  }
  return updated;
}

export function applyPurchase(license, pack, txId, meta = {}) {
  const updated = normalizeLicenseShape({ ...license });
  if (pack.type === 'qualifying') {
    updated.qualifyingRemaining = (updated.qualifyingRemaining || 0) + pack.count;
  } else {
    updated.racesRemaining = (updated.racesRemaining || 0) + pack.count;
  }
  updated.purchases = [
    ...(updated.purchases || []),
    {
      date: new Date().toISOString(),
      packId: pack.id,
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

/**
 * Append a payment lifecycle event to the local license ledger.
 * Keeps only the most recent 120 entries.
 */
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

// ── PayPal Checkout (hosted page) ─────────────────────────────────────────────
/**
 * Get a PayPal OAuth2 access token.
 */
async function paypalAccessToken() {
  const creds = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error_description || 'PayPal auth failed');
  return data.access_token;
}

function paypalErrorMessage(data, fallback = 'PayPal request failed') {
  const detail = data?.details?.[0];
  return detail?.description || data?.message || data?.error_description || data?.name || fallback;
}

function razorpayAuthHeader() {
  const creds = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
  return `Basic ${creds}`;
}

function razorpayErrorMessage(data, fallback = 'Razorpay request failed') {
  return data?.error?.description || data?.description || data?.message || fallback;
}

/**
 * Create a PayPal Order.
 * Returns { url, orderId } — open url in user's browser.
 * After approval PayPal redirects to returnUrl with ?token=ORDER_ID
 * Call capturePayPalOrder() with orderId to finalise and grant credits.
 *
 * @param {object} pack       - pack from generateRacePacks()
 * @param {string} returnUrl  - deep link success URL (race-engineer://paypal-success?...)
 * @param {string} cancelUrl  - deep link cancel URL
 * @param {{ currencyCode?: string }} [options]
 */
export async function createPayPalOrder(pack, returnUrl, cancelUrl, options = {}) {
  if (isDevMode()) {
    return { url: `${returnUrl}&order_id=DEV_ORDER_${Date.now()}&pack_id=${pack.id}`, orderId: `DEV_ORDER_${Date.now()}` };
  }
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return { error: 'PayPal not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing)' };
  }

  try {
    const currencyCode = normalizePayPalCurrencyCode(options.currencyCode || pack.currencyCode);
    const priceAmount = Number.isFinite(Number(pack?.priceAmount))
      ? toCurrencyAmount(Number(pack.priceAmount), currencyCode)
      : usdToCurrency(Number(pack?.priceUSD || 0), currencyCode);
    const decimals = currencyFractionDigits(currencyCode);
    const amountValue = decimals === 0
      ? String(Math.round(priceAmount))
      : priceAmount.toFixed(decimals);

    const token = await paypalAccessToken();
    const res = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: currencyCode, value: amountValue },
          description: `Race Engineer — ${pack.label}`,
          custom_id: pack.id, // pack id stored here for retrieval after capture
        }],
        application_context: {
          brand_name: 'Race Engineer',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      }),
    });
    const order = await res.json();
    if (!res.ok || order.error || !order.id) {
      return { error: paypalErrorMessage(order, `PayPal order creation failed (${res.status})`) };
    }
    const approvalLink = order.links?.find(l => l.rel === 'approve')?.href;
    if (!approvalLink) return { error: 'No PayPal approval URL returned' };
    return { url: approvalLink, orderId: order.id, currencyCode, amountValue };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Capture (finalise) a PayPal Order after user approves.
 * Returns { success, packId, packCount, packType, txId }
 */
export async function capturePayPalOrder(orderId, packId) {
  if (isDevMode() || orderId.startsWith('DEV_ORDER_')) {
    return { success: true, paymentStatus: 'COMPLETED', txId: orderId, packId };
  }
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return { success: false, error: 'PayPal not configured' };
  }

  try {
    const token = await paypalAccessToken();
    const orderRes = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const orderData = await orderRes.json();
    const orderStatus = orderData?.status;
    const extractPaymentAmount = (unit, capture) => {
      const amount = capture?.amount || unit?.amount || {};
      return {
        currencyCode: amount.currency_code || null,
        amountValue: amount.value || null,
      };
    };

    if (orderStatus === 'COMPLETED') {
      const unit = orderData.purchase_units?.[0];
      const resolvedPackId = unit?.custom_id || packId;
      const capture = unit?.payments?.captures?.[0];
      const paid = extractPaymentAmount(unit, capture);
      return {
        success: true,
        paymentStatus: orderStatus,
        txId: capture?.id || orderId,
        packId: resolvedPackId,
        currencyCode: paid.currencyCode,
        amountValue: paid.amountValue,
      };
    }

    if (orderStatus && orderStatus !== 'APPROVED') {
      return {
        success: false,
        pending: true,
        status: orderStatus,
        error: `Payment status: ${orderStatus}`,
      };
    }

    const res = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json();

    const alreadyCaptured = data?.details?.some(d => d?.issue === 'ORDER_ALREADY_CAPTURED');
    if (alreadyCaptured) {
      const latestRes = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const latest = await latestRes.json();
      const unit = latest.purchase_units?.[0];
      const resolvedPackId = unit?.custom_id || packId;
      const capture = unit?.payments?.captures?.[0];
      const paid = extractPaymentAmount(unit, capture);
      return {
        success: true,
        paymentStatus: latest?.status || 'COMPLETED',
        txId: capture?.id || orderId,
        packId: resolvedPackId,
        currencyCode: paid.currencyCode,
        amountValue: paid.amountValue,
      };
    }

    if (data.status !== 'COMPLETED') {
      const status = data?.status || orderStatus || 'unknown';
      const pending = status !== 'DECLINED' && status !== 'VOIDED' && status !== 'FAILED';
      return {
        success: false,
        pending,
        status,
        error: pending ? `Payment status: ${status}` : paypalErrorMessage(data, `Payment status: ${status}`),
      };
    }
    // Retrieve pack metadata from custom_id
    const unit = data.purchase_units?.[0];
    const resolvedPackId = unit?.custom_id || packId;
    const capture = unit?.payments?.captures?.[0];
    const paid = extractPaymentAmount(unit, capture);
    return {
      success: true,
      paymentStatus: data.status,
      txId: capture?.id || orderId,
      packId: resolvedPackId,
      currencyCode: paid.currencyCode,
      amountValue: paid.amountValue,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Machine ID ────────────────────────────────────────────────────────────────
/**
 * Returns a stable machine ID stored in the userData directory.
 * Generated once on first run; survives reinstalls as long as userData persists.
 * Falls back to a hostname-based hash if no path is provided.
 */
/**
 * Create a Razorpay Payment Link and return the hosted URL.
 * The app polls Razorpay for final status after the user completes payment.
 */
export async function createRazorpayPaymentLink(pack, options = {}) {
  const devId = `DEV_RZP_${Date.now()}`;
  if (isDevMode()) {
    const encodedPackId = encodeURIComponent(pack.id);
    return {
      url: `race-engineer://paypal-success?token=${devId}&pack_id=${encodedPackId}&provider=razorpay`,
      orderId: devId,
      currencyCode: 'INR',
      amountValue: '0.00',
    };
  }
  if (!isRazorpayConfigured()) {
    return { error: 'Razorpay not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)' };
  }

  try {
    const currencyCode = normalizeRazorpayCurrencyCode(options.currencyCode || pack.currencyCode);
    const amountValue = Number.isFinite(Number(pack?.priceAmount))
      ? toCurrencyAmount(Number(pack.priceAmount), currencyCode)
      : usdToCurrency(Number(pack?.priceUSD || 0), currencyCode);
    const referenceId = `re_${pack.id}_${Date.now()}`.slice(0, 40);

    const res = await fetch(`${RAZORPAY_BASE_URL}/payment_links`, {
      method: 'POST',
      headers: {
        Authorization: razorpayAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: toMinorUnits(amountValue, currencyCode),
        currency: currencyCode,
        accept_partial: false,
        description: `Race Engineer - ${pack.label}`,
        reference_id: referenceId,
        notes: {
          packId: pack.id,
          packLabel: pack.label,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok || !data?.id || !data?.short_url) {
      return { error: razorpayErrorMessage(data, `Razorpay payment link creation failed (${res.status})`) };
    }
    return {
      url: data.short_url,
      orderId: data.id,
      currencyCode,
      amountValue: amountValue.toFixed(currencyFractionDigits(currencyCode)),
    };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Fetch a Razorpay Payment Link to confirm payment status.
 */
export async function fetchRazorpayPaymentLink(linkId) {
  if (isDevMode() || String(linkId || '').startsWith('DEV_RZP_')) {
    return {
      success: true,
      paymentStatus: 'paid',
      txId: String(linkId || `DEV_RZP_${Date.now()}`),
      currencyCode: 'INR',
      amountValue: '0.00',
    };
  }
  if (!isRazorpayConfigured()) {
    return { success: false, error: 'Razorpay not configured' };
  }

  try {
    const res = await fetch(`${RAZORPAY_BASE_URL}/payment_links/${linkId}`, {
      method: 'GET',
      headers: {
        Authorization: razorpayAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json();
    if (!res.ok || !data?.id) {
      return { success: false, error: razorpayErrorMessage(data, `Razorpay payment lookup failed (${res.status})`) };
    }

    const status = String(data.status || '').toLowerCase();
    if (status !== 'paid') {
      const pending = !['cancelled', 'expired', 'failed'].includes(status);
      return {
        success: false,
        pending,
        status: status ? status.toUpperCase() : 'PENDING',
        error: `Payment status: ${status || 'pending'}`,
      };
    }

    const currencyCode = normalizeRazorpayCurrencyCode(data.currency || getDefaultRazorpayCurrency());
    const payment = Array.isArray(data.payments) && data.payments.length > 0 ? data.payments[0] : null;
    const amountMinor = Number.isFinite(Number(payment?.amount)) ? Number(payment.amount) : Number(data.amount || 0);

    return {
      success: true,
      paymentStatus: 'paid',
      txId: payment?.payment_id || payment?.id || data.id,
      packId: data.notes?.packId || null,
      currencyCode,
      amountValue: fromMinorUnits(amountMinor, currencyCode).toFixed(currencyFractionDigits(currencyCode)),
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export function getMachineId(userDataPath) {
  if (userDataPath) {
    const idFile = `${userDataPath}/machine-id`;
    try {
      const existing = fs.readFileSync(idFile, 'utf8').trim();
      if (existing && existing.length >= 8) return existing;
    } catch { /**/ }
    // Generate new ID
    const id = crypto.randomBytes(16).toString('hex');
    try { fs.writeFileSync(idFile, id, 'utf8'); } catch { /**/ }
    return id;
  }
  // Fallback: hash of hostname (less stable but no path needed)
  return crypto.createHash('sha256').update(os.hostname()).digest('hex').slice(0, 32);
}

// ── License Key System ────────────────────────────────────────────────────────
/**
 * How it works:
 * 1. User buys a pack via Stripe Checkout
 * 2. After Stripe payment verified, app calls Worker /register with the license key
 *    → Worker stores { licenseKey, packType, packCount, activations: [] } in KV
 * 3. App immediately calls Worker /activate { licenseKey, machineId }
 *    → Worker adds this machine to activations list (max 2 machines)
 * 4. On reinstall/new machine: user enters key → app calls /activate again
 *    → Same machine: re-activates silently
 *    → New machine: added if < maxActivations slots used
 * 5. On app start: app calls /validate { licenseKey, machineId } to confirm still valid
 *
 * Key format: RE-XXXX-XXXX-XXXX
 * Stored in Cloudflare KV as "lic:RE-XXXX-XXXX-XXXX"
 */

export function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable chars
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `RE-${seg()}-${seg()}-${seg()}`;
}

/**
 * Deterministic key generation for a given order ID.
 * This keeps retries idempotent if verification is repeated.
 */
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
    const res = await fetch(`${WORKER_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  } catch (e) {
    return {
      error: `License server unreachable: ${e.message}`,
      code: 'LICENSE_SERVER_UNREACHABLE',
    };
  }
}

/**
 * Register a new license key with the Worker after a Stripe purchase.
 * Called server-side (main process) so WORKER_ADMIN_SECRET is safe.
 */
export async function registerLicenseKey(licenseKey, pack, stripeTxId) {
  if (isDevMode()) return { success: true };
  if (!WORKER_URL) return { success: false, error: 'WORKER_URL not set' };
  try {
    const res = await fetch(`${WORKER_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': WORKER_ADMIN_SECRET,
      },
      body: JSON.stringify({
        licenseKey,
        packId:   pack.id,
        packType: pack.type,
        packCount: pack.count,
        stripeTxId,
      }),
    });
    return res.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Activate a license key on this machine.
 * Returns { success, packType, packCount, packId } or { error }.
 */
export async function activateLicenseKey(licenseKey, machineId, machineLabel) {
  if (isDevMode() || licenseKey.startsWith('RE-DEV-')) {
    const parts = licenseKey.split('-');
    const packType = parts[2]?.toLowerCase() === 'qual' ? 'qualifying' : 'race';
    const packCount = parseInt(parts[3] || '1') || 1;
    return {
      success: true,
      packType,
      packCount,
      packId: `dev_${packType}`,
      mode: 'dev',
      racesRemaining: 999,
      qualifyingRemaining: 999,
      exhausted: false,
    };
  }
  const result = await workerPost('/activate', { licenseKey, machineId, machineLabel });
  if (result.error) return { success: false, error: result.error };
  return {
    success: true,
    ...result,
    racesRemaining: Number.isFinite(result.racesRemaining) ? Number(result.racesRemaining) : undefined,
    qualifyingRemaining: Number.isFinite(result.qualifyingRemaining) ? Number(result.qualifyingRemaining) : undefined,
  };
}

/**
 * Validate that a license key is still active on this machine.
 * Call on app start to catch key transfers or admin revocations.
 * Returns { valid, packType, packCount } or { valid: false, reason }.
 */
export async function validateLicenseKey(licenseKey, machineId) {
  if (isDevMode() || licenseKey.startsWith('RE-DEV-')) {
    const parts = licenseKey.split('-');
    const packType = parts[2]?.toLowerCase() === 'qual' ? 'qualifying' : 'race';
    const packCount = parseInt(parts[3] || '1') || 1;
    return {
      valid: true,
      packType,
      packCount,
      racesRemaining: 999,
      qualifyingRemaining: 999,
      exhausted: false,
    };
  }
  return workerPost('/validate', { licenseKey, machineId });
}

/**
 * Consume one credit on the backend for an activated license key.
 * Returns { success, racesRemaining, qualifyingRemaining, exhausted } or { error }.
 */
export async function consumeLicenseKeyCredit(licenseKey, machineId, sessionType = 'race') {
  if (isDevMode() || String(licenseKey || '').startsWith('RE-DEV-')) {
    return { success: true, racesRemaining: 999, qualifyingRemaining: 999, exhausted: false, mode: 'dev' };
  }
  return workerPost('/consume', { licenseKey, machineId, sessionType });
}

/**
 * Refund one consumed credit on backend (used when session startup fails after consume).
 */
export async function refundLicenseKeyCredit(licenseKey, machineId, sessionType = 'race') {
  if (isDevMode() || String(licenseKey || '').startsWith('RE-DEV-')) {
    return { success: true, racesRemaining: 999, qualifyingRemaining: 999, exhausted: false, mode: 'dev' };
  }
  return workerPost('/refund', { licenseKey, machineId, sessionType });
}

/**
 * Deactivate this machine's license key slot (freeing it for another machine).
 */
export async function deactivateLicenseKey(licenseKey, machineId) {
  if (isDevMode()) return { success: true };
  return workerPost('/deactivate', { licenseKey, machineId });
}

// Keep for backward compatibility — no longer used for cross-machine lookup
// (Worker /register handles registration now)
export async function attachLicenseKeyToPayment(sessionId, licenseKey, pack) {
  // No-op: Worker registration replaces Stripe metadata tagging
  return { success: true };
}

// Keep for backward compat — replaced by activateLicenseKey
export async function lookupLicenseKey(licenseKey) {
  if (isDevMode() || licenseKey.startsWith('RE-DEV-')) {
    const parts = licenseKey.split('-');
    const type  = parts[2]?.toLowerCase() === 'qual' ? 'qualifying' : 'race';
    const count = parseInt(parts[3] || '1') || 1;
    return { found: true, paid: true, packType: type, packCount: count, packId: `dev_${type}`, txId: licenseKey };
  }
  // Delegate to Worker activate (which also validates)
  return { found: false, error: 'Use activateLicenseKey() instead.' };
}

