import { defineConfig } from 'vite';
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Load .env at BUILD TIME (runs in Node during vite build, not in Electron)
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');
const envResult = dotenvConfig({ path: envPath });
const env = envResult.parsed || {};

// Inject env vars at build time using Vite `define`.
// In source code, use __ENV__.KEY instead of process.env.KEY.
const envBundle = {
  PAYPAL_CLIENT_ID:     env.PAYPAL_CLIENT_ID     || '',
  PAYPAL_CLIENT_SECRET: env.PAYPAL_CLIENT_SECRET || '',
  PAYPAL_SANDBOX:       env.PAYPAL_SANDBOX       || '',
  PAYPAL_DEFAULT_CURRENCY: env.PAYPAL_DEFAULT_CURRENCY || '',
  PAYPAL_SUPPORTED_CURRENCIES: env.PAYPAL_SUPPORTED_CURRENCIES || '',
  PAYPAL_FX_RATES_JSON: env.PAYPAL_FX_RATES_JSON || '',
  RAZORPAY_KEY_ID:      env.RAZORPAY_KEY_ID      || '',
  RAZORPAY_KEY_SECRET:  env.RAZORPAY_KEY_SECRET  || '',
  RAZORPAY_DEFAULT_CURRENCY: env.RAZORPAY_DEFAULT_CURRENCY || '',
  RAZORPAY_SUPPORTED_CURRENCIES: env.RAZORPAY_SUPPORTED_CURRENCIES || '',
  RACE_ENGINEER_OPENAI_KEY: env.RACE_ENGINEER_OPENAI_KEY || '',
  WORKER_URL:           env.WORKER_URL           || '',
  WORKER_ADMIN_SECRET:  env.WORKER_ADMIN_SECRET  || '',
  RACE_ENGINEER_DEV:    env.RACE_ENGINEER_DEV    || '',
  ANTHROPIC_API_KEY:    env.ANTHROPIC_API_KEY    || '',
};

// Electron Forge's plugin-vite provides a base external list including 'electron'
// and all Node builtins. We MUST NOT override it — only extend it.
import { builtins } from '@electron-forge/plugin-vite/dist/config/vite.base.config.js';

export default defineConfig({
  define: {
    '__ENV__': JSON.stringify(envBundle),
  },
  build: {
    rollupOptions: {
      external: [...builtins, '@anthropic-ai/sdk', 'edge-tts-universal', 'ws'],
    },
  },
});
