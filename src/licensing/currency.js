import {
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  RUNTIME_ENV,
} from './env.js';

const COST_PER_RACE_MINUTE_USD = 0.0125;
const PACK_PRICE_UPLIFT = 1.10;
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
  const raw = String(RUNTIME_ENV.PAYPAL_FX_RATES_JSON || '').trim();
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

const PAYPAL_DEFAULT_CURRENCY = String(RUNTIME_ENV.PAYPAL_DEFAULT_CURRENCY || 'USD').trim().toUpperCase() || 'USD';
const RAZORPAY_DEFAULT_CURRENCY = String(RUNTIME_ENV.RAZORPAY_DEFAULT_CURRENCY || 'INR').trim().toUpperCase() || 'INR';

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
  const set = new Set(buildCurrencyList(RUNTIME_ENV.PAYPAL_SUPPORTED_CURRENCIES || '', PAYPAL_DEFAULT_CURRENCY));
  set.add('USD');
  return Array.from(set);
})();

const RAZORPAY_SUPPORTED_CURRENCIES = (() => {
  const set = new Set(buildCurrencyList(RUNTIME_ENV.RAZORPAY_SUPPORTED_CURRENCIES || '', RAZORPAY_DEFAULT_CURRENCY));
  set.add(RAZORPAY_DEFAULT_CURRENCY);
  return Array.from(set);
})();

export function normalizeCurrencyCode(currencyCode, fallback = 'USD', supportedCurrencies = ALL_SUPPORTED_CURRENCIES) {
  const normalized = String(currencyCode || '').trim().toUpperCase();
  if (normalized && supportedCurrencies.includes(normalized)) return normalized;
  if (supportedCurrencies.includes(fallback)) return fallback;
  return 'USD';
}

export function normalizePayPalCurrencyCode(currencyCode, fallback = PAYPAL_DEFAULT_CURRENCY) {
  return normalizeCurrencyCode(currencyCode, fallback, PAYPAL_SUPPORTED_CURRENCIES);
}

export function normalizeRazorpayCurrencyCode(currencyCode, fallback = RAZORPAY_DEFAULT_CURRENCY) {
  return normalizeCurrencyCode(currencyCode, fallback, RAZORPAY_SUPPORTED_CURRENCIES);
}

export function currencyFractionDigits(currencyCode) {
  return ZERO_DECIMAL_CURRENCIES.has(currencyCode) ? 0 : 2;
}

export function toCurrencyAmount(amount, currencyCode) {
  const digits = currencyFractionDigits(currencyCode);
  const factor = 10 ** digits;
  const rounded = Math.round(Number(amount || 0) * factor) / factor;
  return Math.max(0, rounded);
}

export function toMinorUnits(amount, currencyCode) {
  const code = normalizeCurrencyCode(currencyCode);
  const digits = currencyFractionDigits(code);
  return Math.max(0, Math.round(Number(amount || 0) * (10 ** digits)));
}

export function fromMinorUnits(amount, currencyCode) {
  const code = normalizeCurrencyCode(currencyCode);
  const digits = currencyFractionDigits(code);
  return toCurrencyAmount(Number(amount || 0) / (10 ** digits), code);
}

export function usdToCurrency(amountUsd, currencyCode) {
  const code = normalizeCurrencyCode(currencyCode);
  const rate = Number(USD_FX_RATES[code] || 1);
  return toCurrencyAmount(Number(amountUsd || 0) * rate, code);
}

export function formatCurrency(amount, currencyCode) {
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

export function generateRacePacks(opts = {}) {
  const { raceLaps = 58, racePercent = 100, activeSituations = 35, currencyCode } = opts;
  const selectedCurrency = normalizeCurrencyCode(currencyCode);
  const raceMin = estimateRaceMinutes(raceLaps, racePercent);
  const costPerRace = estimateCostUSD(raceMin, activeSituations);

  const packs = [
    { id: 'race_1', type: 'session', count: 1, label: '1 Credit', discount: 0, minutes: raceMin },
    { id: 'race_2', type: 'session', count: 2, label: '2 Credits', discount: 0.05, minutes: raceMin },
    { id: 'race_5', type: 'session', count: 5, label: '5 Credits', discount: 0.10, minutes: raceMin },
    { id: 'race_10', type: 'session', count: 10, label: '10 Credits', discount: 0.15, minutes: raceMin },
  ];

  return packs.map((pack) => {
    const baseCost = costPerRace * pack.count;
    const priceUSD = Math.max(baseCost * (1 - pack.discount) * PACK_PRICE_UPLIFT, MIN_PACK_PRICE_USD);
    const convertedPrice = usdToCurrency(priceUSD, selectedCurrency);
    const perRacePrice = pack.count > 1 ? toCurrencyAmount(convertedPrice / pack.count, selectedCurrency) : null;
    return {
      ...pack,
      priceUSD,
      currencyCode: selectedCurrency,
      priceAmount: convertedPrice,
      priceDisplay: formatCurrency(convertedPrice, selectedCurrency),
      perRaceDisplay: pack.count > 1 ? `${formatCurrency(perRacePrice, selectedCurrency)}/credit` : null,
    };
  });
}

