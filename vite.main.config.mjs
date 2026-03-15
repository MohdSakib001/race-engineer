import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2] ?? '';
    const quote = value[0];
    if ((quote === '"' || quote === '\'' || quote === '`') && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    value = value
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .trim();
    result[key] = value;
  }
  return result;
}

// Load .env at BUILD TIME (runs in Node during vite build, not in Electron)
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');
const env = parseEnvFile(envPath);

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
    'process.env.WS_NO_BUFFER_UTIL': JSON.stringify('1'),
    'process.env.WS_NO_UTF_8_VALIDATE': JSON.stringify('1'),
  },
  resolve: {
    alias: {
      bufferutil: path.join(path.dirname(fileURLToPath(import.meta.url)), 'src/main/shims/ws-optional-native-addon.js'),
      'utf-8-validate': path.join(path.dirname(fileURLToPath(import.meta.url)), 'src/main/shims/ws-optional-native-addon.js'),
    },
  },
  build: {
    rollupOptions: {
      // Keep only Node/Electron builtins external.
      // App deps must be bundled because packaged app.asar has no node_modules folder.
      external: [...builtins],
    },
  },
});
