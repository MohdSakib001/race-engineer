// __ENV__ is injected at build time by vite.main.config.mjs.
// eslint-disable-next-line no-undef
const env = typeof __ENV__ !== 'undefined' ? __ENV__ : {};

export const RUNTIME_ENV = env;

export const PAYPAL_CLIENT_ID = env.PAYPAL_CLIENT_ID || '';
export const PAYPAL_CLIENT_SECRET = env.PAYPAL_CLIENT_SECRET || '';
export const PAYPAL_BASE_URL = env.PAYPAL_SANDBOX === '0'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

export const RAZORPAY_KEY_ID = env.RAZORPAY_KEY_ID || '';
export const RAZORPAY_KEY_SECRET = env.RAZORPAY_KEY_SECRET || '';
export const RAZORPAY_BASE_URL = 'https://api.razorpay.com/v1';

export const YOUR_APP_OPENAI_KEY = env.RACE_ENGINEER_OPENAI_KEY || '';

export const WORKER_URL = env.WORKER_URL || '';
export const WORKER_ADMIN_SECRET = env.WORKER_ADMIN_SECRET || '';

export const DEV_SESSION_CREDITS = 999;

export function isDevMode() {
  const runtimeFlag = (typeof process !== 'undefined' && process.env)
    ? process.env.RACE_ENGINEER_DEV
    : '';
  const flag = String(env.RACE_ENGINEER_DEV || runtimeFlag || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

