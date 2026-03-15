import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
// Env vars are injected at build time via vite.main.config.mjs `define`.
// No runtime dotenv needed � process.env.X is replaced with literal values during build.

import started from 'electron-squirrel-startup';
import { IsomorphicCommunicate } from 'edge-tts-universal';
import { GptRealtimeEngineer } from './gpt-realtime.js';
import { TRACK_NAMES, SESSION_TYPES, WEATHER, TEAM_COLORS, TYRE_COMPOUNDS, ACTUAL_COMPOUNDS } from './main/lookups.js';
import { createLicenseRuntime } from './main/license-runtime.js';
import { createRaceAnalysisStore } from './main/race-analysis-store.js';
import { createTelemetryRuntime } from './main/telemetry-runtime.js';
import { registerPaymentAndLicenseIpc } from './main/ipc/payment-license.js';
import { ENGINEER_SYSTEM_PROMPT } from './main/prompts.js';
import {
  loadLicense,
  saveLicense,
  hasCredits,
  consumeCredit,
  applyPurchase,
  generateRacePacks,
  generateLicenseKeyFromOrder,
  isDevMode,
  getSupportedPayPalCurrencies,
  getDefaultPayPalCurrency,
  getSupportedRazorpayCurrencies,
  getDefaultRazorpayCurrency,
  isPayPalConfigured,
  isRazorpayConfigured,
  createPayPalOrder,
  capturePayPalOrder,
  createRazorpayPaymentLink,
  fetchRazorpayPaymentLink,
  recordPaymentEvent,
  registerLicenseKey,
  activateLicenseKey,
  validateLicenseKey,
  consumeLicenseKeyCredit,
  refundLicenseKeyCredit,
  deactivateLicenseKey,
  getMachineId,
  getResolvedCreditsRemaining,
  applySharedCreditAliases,
  YOUR_APP_OPENAI_KEY,
} from './licensing.js';

if (started) app.quit();

// Single instance lock � required for Windows deep links
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// Avoid noisy Chromium QUIC path-id errors on some networks/proxies.
// Fallback to HTTPS over TCP for all Electron network traffic.
app.commandLine.appendSwitch('disable-quic');

// ─── Multi-window management ────────────────────────────────────────────────
const allWindows = new Set();

// ─── Constants ────────────────────────────────────────────────────────────────
const telemetryRuntime = createTelemetryRuntime({ allWindows });
const raceAnalysisStore = createRaceAnalysisStore({ app, fs, path });
const {
  attachWindowToPort,
  getContextForWindow,
  getWindowByWebContentsId,
  sendToWindow,
  setManualTrackId,
  startTelemetryForWindow,
  stopTelemetryForWindow,
  dispose: disposeTelemetry,
} = telemetryRuntime;

// Electron Setup ───────────────────────────────────────────────────────────
let mainWindow;
let checkoutWindow = null;
let anthropic = null;
// eslint-disable-next-line no-undef
const _env = typeof __ENV__ !== 'undefined' ? __ENV__ : {};
let apiKey = _env.ANTHROPIC_API_KEY || null;

function loadWindowURL(win, queryStr = '') {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL + (queryStr ? '?' + queryStr : ''));
  } else {
    const filePath = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
    const search = queryStr ? `?${queryStr}` : '';
    win.loadFile(filePath, search ? { search } : undefined);
  }
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#050509',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const mainWindowId = mainWindow.webContents.id;
  allWindows.add(mainWindow);
  mainWindow.on('closed', () => {
    stopTelemetryForWindow(mainWindowId, false);
    allWindows.delete(mainWindow);
  });

  loadWindowURL(mainWindow);
};

function closeCheckoutWindow() {
  if (checkoutWindow && !checkoutWindow.isDestroyed()) {
    checkoutWindow.close();
  }
  checkoutWindow = null;
}

function isPayPalCheckoutUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return host.includes('paypal.com') || host.includes('paypalobjects.com');
  } catch {
    return false;
  }
}

function isRazorpayCheckoutUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return host.includes('razorpay.com');
  } catch {
    return false;
  }
}

async function openPayPalCheckoutWindow(url) {
  // Always use a fresh ephemeral profile for PayPal checkout so sandbox
  // seller cookies from previous attempts do not leak into buyer flow.
  closeCheckoutWindow();
  const checkoutPartition = `nopersist:paypal-checkout-${Date.now()}`;

  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  checkoutWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    title: 'PayPal Checkout',
    backgroundColor: '#050509',
    parent,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: checkoutPartition,
    },
  });

  allWindows.add(checkoutWindow);
  checkoutWindow.on('closed', () => {
    allWindows.delete(checkoutWindow);
    checkoutWindow = null;
  });

  const interceptDeepLink = (event, targetUrl) => {
    if (typeof targetUrl === 'string' && targetUrl.startsWith('race-engineer://')) {
      event.preventDefault();
      handleDeepLink(targetUrl);
      closeCheckoutWindow();
    }
  };

  checkoutWindow.webContents.on('will-redirect', interceptDeepLink);
  checkoutWindow.webContents.on('will-navigate', interceptDeepLink);
  checkoutWindow.webContents.on('did-fail-load', (_event, _code, _desc, failedUrl) => {
    if (typeof failedUrl === 'string' && failedUrl.startsWith('race-engineer://')) {
      handleDeepLink(failedUrl);
      closeCheckoutWindow();
    }
  });

  checkoutWindow.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
    if (typeof popupUrl === 'string' && popupUrl.startsWith('race-engineer://')) {
      handleDeepLink(popupUrl);
      closeCheckoutWindow();
      return { action: 'deny' };
    }
    if (/^https?:\/\//i.test(popupUrl)) {
      checkoutWindow.loadURL(popupUrl).catch(() => {});
    }
    return { action: 'deny' };
  });

  await checkoutWindow.loadURL(url);
  checkoutWindow.focus();
}

// ─── Packet Parsing ───────────────────────────────────────────────────────────
// ─── Claude AI Engineer ───────────────────────────────────────────────────────


ipcMain.handle('tts-speak', async (_, { text, voice }) => {
  const communicate = new IsomorphicCommunicate(text, { voice });
  const chunks = [];
  for await (const chunk of communicate.stream()) {
    if (chunk.type === 'audio' && chunk.data) chunks.push(Buffer.from(chunk.data));
  }
  return Buffer.concat(chunks).toString('base64');
});

ipcMain.handle('ask-engineer', async (_, { question, context, mode }) => {
  if (!apiKey) {
    return { error: 'No API key set. Go to Settings and enter your Anthropic API key.' };
  }
  try {
    if (!anthropic) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      anthropic = new Anthropic({ apiKey });
    }

    const contextStr = context
      ? `\nLIVE TELEMETRY CONTEXT:\n${JSON.stringify(context, null, 2)}\n`
      : '';

    const outputMode = mode === 'ENGINEER_DECISION'
      ? '\n\nOUTPUT MODE: ENGINEER_DECISION\nRespond in EXACTLY this format:\nspeak: yes/no\nurgency: low/medium/high/critical\ncategory: <type>\nreason: <one sentence>\nradio: <max 2 short sentences>'
      : '';

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 512,
      system: ENGINEER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${contextStr}${outputMode}\n\n${question}`,
        },
      ],
    });

    return { response: message.content[0].text };
  } catch (err) {
    return { error: `API error: ${err.message}` };
  }
});

ipcMain.on('set-api-key', (_, key) => {
  apiKey = key.trim();
  anthropic = null; // reset client
});

// --- GPT Realtime AI Engineer -------------------------------------------------
let gptRealtimeEngine = null;
let gptRealtimeSubscriberWindowId = null;

function sendToGptSubscriber(channel, data) {
  if (gptRealtimeSubscriberWindowId == null) return;
  sendToWindow(gptRealtimeSubscriberWindowId, channel, data);
}
const {
  hasCreditPayload,
  getSyncedCredits,
  loadLicenseMain,
  validateLicenseOnStartup,
  saveLicenseMain,
  logPaymentEventMain,
  broadcastLicense,
  getPaymentProviders,
  getPaymentProvider,
} = createLicenseRuntime({
  app,
  path,
  allWindows,
  loadLicense,
  saveLicense,
  recordPaymentEvent,
  isDevMode,
  validateLicenseKey,
  getMachineId,
  getResolvedCreditsRemaining,
  applySharedCreditAliases,
  isPayPalConfigured,
  isRazorpayConfigured,
  getSupportedPayPalCurrencies,
  getDefaultPayPalCurrency,
  getSupportedRazorpayCurrencies,
  getDefaultRazorpayCurrency,
});

registerPaymentAndLicenseIpc({
  ipcMain,
  app,
  createPayPalOrder,
  capturePayPalOrder,
  createRazorpayPaymentLink,
  fetchRazorpayPaymentLink,
  generateRacePacks,
  generateLicenseKeyFromOrder,
  isDevMode,
  registerLicenseKey,
  activateLicenseKey,
  deactivateLicenseKey,
  applyPurchase,
  applySharedCreditAliases,
  getMachineId,
  loadLicenseMain,
  saveLicenseMain,
  logPaymentEventMain,
  broadcastLicense,
  hasCreditPayload,
  getSyncedCredits,
  getPaymentProviders,
  getPaymentProvider,
});


ipcMain.handle('gpt-realtime-connect', async (event, { userApiKey, voice, sessionType }) => {
  const lic = loadLicenseMain();
  const sType = sessionType || 'race';

  const isByok = lic.byokMode && userApiKey;
  const keyToUse = isByok ? userApiKey : YOUR_APP_OPENAI_KEY;
  const requiresLiveLicense = !isByok && !lic.devMode && !isDevMode();

  if (requiresLiveLicense && !lic.licenseKey) {
    return {
      error: 'No active license key. Activate a license key in Settings or buy a pack first.',
      code: 'NO_LICENSE_KEY',
      needsNewKey: true,
      creditsRemaining: lic.creditsRemaining || 0,
      racesRemaining: lic.creditsRemaining || 0,
      qualifyingRemaining: lic.creditsRemaining || 0,
    };
  }

  if (!isByok && !hasCredits(lic, sType)) {
    const exhausted = !!lic.licenseKey && (lic.creditsRemaining || 0) <= 0;
    return {
      error: exhausted
        ? 'Your current license key has no credits left. Activate a new key or buy another pack.'
        : 'No AI Engineer credits. Buy a credit pack or use your own OpenAI key (BYOK mode).',
      code: exhausted ? 'LICENSE_EXHAUSTED' : 'NO_CREDITS',
      needsNewKey: exhausted,
      creditsRemaining: lic.creditsRemaining || 0,
      racesRemaining: lic.creditsRemaining || 0,
      qualifyingRemaining: lic.creditsRemaining || 0,
    };
  }
  if (!isByok && !keyToUse) {
    return { error: 'App OpenAI key not configured. Contact support or use your own key.' };
  }
  if (isByok && !userApiKey) {
    return { error: 'Enter your OpenAI API key in Settings to use BYOK mode.' };
  }

  let updated = lic;
  let consumedViaWorker = false;
  let consumedMachineId = null;
  if (!isByok) {
    const requiresWorkerAuthority = requiresLiveLicense && !!lic.licenseKey && !lic.licenseKey.startsWith('RE-DEV-');
    if (requiresWorkerAuthority) {
      const machineId = getMachineId(app.getPath('userData'));
      const consumed = await consumeLicenseKeyCredit(lic.licenseKey, machineId, sType);
      if (consumed?.success) {
        consumedViaWorker = true;
        consumedMachineId = machineId;
        updated = applySharedCreditAliases({ ...lic }, getSyncedCredits(consumed, lic.creditsRemaining));
      } else if (consumed?.code === 'NO_CREDITS' || consumed?.code === 'NO_RACE_CREDITS' || consumed?.code === 'NO_QUALIFYING_CREDITS') {
        updated = applySharedCreditAliases({ ...lic }, getSyncedCredits(consumed, lic.creditsRemaining));
        const saved = saveLicenseMain(updated);
        broadcastLicense(saved);
        const exhausted = (saved.creditsRemaining || 0) <= 0;
        return {
          error: consumed.error || 'No credits remaining on this license key.',
          code: consumed.code || (exhausted ? 'LICENSE_EXHAUSTED' : 'NO_CREDITS'),
          needsNewKey: exhausted,
          creditsRemaining: saved.creditsRemaining || 0,
          racesRemaining: saved.creditsRemaining || 0,
          qualifyingRemaining: saved.creditsRemaining || 0,
        };
      } else {
        const serverUnavailable = consumed?.code === 'LICENSE_SERVER_UNAVAILABLE'
          || consumed?.code === 'LICENSE_SERVER_UNREACHABLE';
        logPaymentEventMain({
          stage: serverUnavailable ? 'license_server_unreachable' : 'license_consume_failed',
          level: 'error',
          licenseKey: lic.licenseKey,
          message: serverUnavailable
            ? ((consumed?.error || 'License server unavailable.') + ' AI Engineer is blocked until the license server is reachable.')
            : (consumed?.error || 'Failed to validate remaining credits for this license key.'),
        });
        return {
          error: serverUnavailable
            ? 'License server is unreachable. AI Engineer is unavailable until the license server connection is restored.'
            : (consumed?.error || 'Failed to validate remaining credits for this license key.'),
          code: consumed?.code || 'LICENSE_CONSUME_FAILED',
          needsNewKey: false,
          creditsRemaining: lic.creditsRemaining || 0,
          racesRemaining: lic.creditsRemaining || 0,
          qualifyingRemaining: lic.creditsRemaining || 0,
        };
      }
    } else {
      updated = consumeCredit(lic, sType);
    }
    const saved = saveLicenseMain(updated);
    broadcastLicense(saved);
    updated = saved;
  }

  if (gptRealtimeEngine) {
    try { gptRealtimeEngine.disconnect(); } catch { /**/ }
    gptRealtimeEngine = null;
  }

  gptRealtimeEngine = new GptRealtimeEngineer();
  gptRealtimeSubscriberWindowId = event.sender.id;

  gptRealtimeEngine.onAudioChunk = (chunk) => {
    sendToGptSubscriber('gpt-audio-chunk', { chunk });
  };
  gptRealtimeEngine.onTranscript = (text, done) => {
    sendToGptSubscriber('gpt-transcript', { text, done });
  };
  gptRealtimeEngine.onStatusChange = (status) => {
    sendToGptSubscriber('gpt-status', { status });
    for (const win of allWindows) {
      if (!win.isDestroyed()) win.webContents.send('gpt-status', { status });
    }
  };

  try {
    await gptRealtimeEngine.connect(keyToUse, voice || 'echo');
    return {
      success: true,
      mode: isByok ? 'byok' : 'subscription',
      creditsRemaining: isByok ? null : (updated.creditsRemaining ?? 0),
    };
  } catch (err) {
    if (!isByok) {
      if (consumedViaWorker && lic.licenseKey && consumedMachineId) {
        const refundedRemote = await refundLicenseKeyCredit(lic.licenseKey, consumedMachineId, sType);
        const refunded = applySharedCreditAliases({ ...updated }, getSyncedCredits(refundedRemote, updated.creditsRemaining));
        const saved = saveLicenseMain(refunded);
        broadcastLicense(saved);
      } else {
        const refunded = applySharedCreditAliases({ ...updated }, (updated.creditsRemaining || 0) + 1);
        const saved = saveLicenseMain(refunded);
        broadcastLicense(saved);
      }
    }
    return { error: 'GPT Realtime connection failed: ' + err.message };
  }
});

ipcMain.handle('gpt-realtime-disconnect', () => {
  if (gptRealtimeEngine) {
    gptRealtimeEngine.disconnect();
    gptRealtimeEngine = null;
  }
  gptRealtimeSubscriberWindowId = null;
  return { success: true };
});

ipcMain.handle('gpt-realtime-push', (_, payload) => {
  if (!gptRealtimeEngine?.connected) return { error: 'Not connected' };
  gptRealtimeEngine.pushTelemetry(payload);
  return { success: true };
});

ipcMain.handle('gpt-realtime-status', () => ({
  connected: gptRealtimeEngine?.connected ?? false,
}));

// ─── Settings persistence ────────────────────────────────────────────────────
function settingsPath() {
  return path.join(app.getPath('userData'), 'race-engineer-settings.json');
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
// -- Deep link protocol for PayPal redirect -----------------------------------
// PayPal redirects to race-engineer://paypal-success?token=ORDER_ID&pack_id=...
// Electron intercepts this and sends it to the renderer via IPC.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('race-engineer', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('race-engineer');
}

// macOS / Linux: open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

function handleDeepLink(url) {
  try {
    const parsed = new URL(url);
    if (parsed.host === 'paypal-success') {
      const provider = parsed.searchParams.get('provider') || 'paypal';
      const orderId = parsed.searchParams.get('token');
      const packId  = parsed.searchParams.get('pack_id');
      logPaymentEventMain({
        provider,
        stage: 'checkout_return_success',
        level: 'info',
        orderId: orderId || undefined,
        packId: packId || undefined,
        status: 'APPROVED',
        message: `${provider === 'razorpay' ? 'Razorpay' : 'PayPal'} returned success callback to app.`,
      });
      for (const win of allWindows) {
        if (!win.isDestroyed()) {
          win.webContents.send('stripe-return', { success: true, sessionId: orderId, packId, provider });
          win.focus();
        }
      }
      closeCheckoutWindow();
    } else if (parsed.host === 'paypal-cancel') {
      const orderId = parsed.searchParams.get('token');
      const packId  = parsed.searchParams.get('pack_id');
      logPaymentEventMain({
        provider: 'paypal',
        stage: 'checkout_cancelled',
        level: 'warn',
        orderId: orderId || undefined,
        packId: packId || undefined,
        status: 'CANCELLED',
        message: 'PayPal checkout was cancelled.',
      });
      for (const win of allWindows) {
        if (!win.isDestroyed()) win.webContents.send('stripe-return', { success: false, cancelled: true, provider: 'paypal' });
      }
      closeCheckoutWindow();
    }
  } catch { /**/ }
}

app.whenReady().then(() => {
  createWindow();
  // Validate license key with backend on startup (non-blocking)
  validateLicenseOnStartup().catch(() => {});

  // Windows: deep link comes via second-instance event
  app.on('second-instance', (_, commandLine) => {
    const url = commandLine.find(a => a.startsWith('race-engineer://'));
    if (url) handleDeepLink(url);
    // Bring main window to front
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  ipcMain.handle('load-settings', () => {
    try {
      const raw = fs.readFileSync(settingsPath(), 'utf8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  });

  ipcMain.on('save-settings', (_, settings) => {
    try {
      fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
    } catch (e) {
      console.error('[Race Engineer] Failed to save settings:', e.message);
    }
  });

  ipcMain.on('start-telemetry', (event, port) => {
    startTelemetryForWindow(event.sender.id, port);
  });
  ipcMain.on('stop-telemetry', (event) => {
    stopTelemetryForWindow(event.sender.id);
  });
  ipcMain.on('set-manual-track', (_, trackId) => {
    const resolvedTrackId = setManualTrackId(trackId);
    console.log(`[Race Engineer] Manual track override: ${trackId === -1 ? 'Auto-detect' : TRACK_NAMES[resolvedTrackId] || resolvedTrackId}`);
  });

  // Expose lookup tables to renderer
  ipcMain.handle('get-lookups', () => ({ TRACK_NAMES, SESSION_TYPES, WEATHER, TEAM_COLORS, TYRE_COMPOUNDS, ACTUAL_COMPOUNDS }));

  ipcMain.handle('load-race-analysis-draft', () => {
    try {
      return raceAnalysisStore.loadDraft();
    } catch (error) {
      return { error: error.message || 'Failed to load race analysis draft.' };
    }
  });

  ipcMain.handle('save-race-analysis-draft', (_event, payload = {}) => {
    try {
      return raceAnalysisStore.saveDraft(payload);
    } catch (error) {
      return { error: error.message || 'Failed to save race analysis draft.' };
    }
  });

  ipcMain.handle('list-race-analysis-snapshots', () => {
    try {
      return raceAnalysisStore.listSnapshots();
    } catch (error) {
      return [];
    }
  });

  ipcMain.handle('save-race-analysis-snapshot', async (_event, payload = {}) => {
    try {
      return await raceAnalysisStore.saveSnapshot(payload.snapshot, payload.storageConfig);
    } catch (error) {
      return { error: error.message || 'Failed to save race analysis snapshot.' };
    }
  });

  // Open URL in system browser (for Stripe Checkout)
  ipcMain.handle('open-external', async (_, url) => {
    if (typeof url !== 'string' || !url.trim()) return { error: 'Invalid checkout URL.' };
    const checkoutUrl = url.trim();

    if (checkoutUrl.startsWith('race-engineer://')) {
      handleDeepLink(checkoutUrl);
      return { success: true, mode: 'deep-link' };
    }

    try {
      const parsed = new URL(checkoutUrl);
      if (!/^https?:$/.test(parsed.protocol)) return { error: 'Only HTTP(S) checkout URLs are allowed.' };
    } catch {
      return { error: 'Invalid checkout URL.' };
    }

    try {
      if (isPayPalCheckoutUrl(checkoutUrl) || isRazorpayCheckoutUrl(checkoutUrl)) {
        let matchedOrderId = null;
        let provider = 'paypal';
        try {
          const parsed = new URL(checkoutUrl);
          matchedOrderId = parsed.searchParams.get('token');
          const host = parsed.hostname.toLowerCase();
          if (host.includes('razorpay.com')) provider = 'razorpay';
        } catch { /**/ }
        logPaymentEventMain({
          provider,
          stage: 'checkout_opened',
          level: 'info',
          orderId: matchedOrderId || undefined,
          message: `Opened ${provider === 'razorpay' ? 'Razorpay' : 'PayPal'} checkout in external browser.`,
        });
        closeCheckoutWindow();
        const { shell } = await import('electron');
        await shell.openExternal(checkoutUrl, { activate: true });
        return { success: true, mode: 'external' };
      }
      const { shell } = await import('electron');
      await shell.openExternal(checkoutUrl, { activate: true });
      return { success: true, mode: 'external' };
    } catch (e) {
      return { error: `Failed to open checkout: ${e.message}` };
    }
  });

  // Open a detached child window for a specific page
  ipcMain.handle('open-window', (event, { page, title, width, height }) => {
    const fallbackTitles = {
      dashboard: 'Dashboard',
      timing: 'Timing Tower',
      laphistory: 'Player Lap History',
      analysis: 'Race Analysis',
      trackmap: 'Track Map',
      vehicle: 'Vehicle Status',
      session: 'Session',
      engineer: 'AI Engineer',
      radio: 'Radio Config',
      settings: 'Settings',
    };
    const pageKey = String(page || '').trim().toLowerCase();
    const safeTitle = typeof title === 'string' ? title.trim() : '';
    const fixedTitle = fallbackTitles[pageKey] || safeTitle || 'Race Engineer';
    const child = new BrowserWindow({
      width: width || 1000,
      height: height || 700,
      minWidth: 600,
      minHeight: 400,
      backgroundColor: '#050509',
      title: fixedTitle,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    const childWindowId = child.webContents.id;
    child.setTitle(fixedTitle);
    allWindows.add(child);
    child.on('closed', () => {
      stopTelemetryForWindow(childWindowId, false);
      allWindows.delete(child);
    });
    child.on('page-title-updated', (e) => {
      e.preventDefault();
      child.setTitle(fixedTitle);
    });
    child.webContents.on('did-navigate', () => child.setTitle(fixedTitle));
    child.webContents.on('did-navigate-in-page', () => child.setTitle(fixedTitle));
    loadWindowURL(child, `detach=${encodeURIComponent(pageKey)}&title=${encodeURIComponent(fixedTitle)}`);

    // Keep detached window title fixed and inherit source window telemetry context if present.
    child.webContents.once('did-finish-load', () => {
      child.setTitle(fixedTitle);
      const sourceContext = getContextForWindow(event.sender.id);
      if (sourceContext) {
        attachWindowToPort(child.webContents.id, sourceContext.port);
      }
    });
  });

  ipcMain.on('set-window-title', (event, rawTitle) => {
    const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    if (!title) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.setTitle(title);
    }
  });

  ipcMain.handle('save-export-file', async (_event, payload = {}) => {
    const defaultName = typeof payload.defaultName === 'string' && payload.defaultName.trim()
      ? payload.defaultName.trim()
      : 'race-engineer-export.csv';
    const filters = Array.isArray(payload.filters) && payload.filters.length > 0
      ? payload.filters
      : [{ name: 'CSV', extensions: ['csv'] }];
    const content = typeof payload.content === 'string' ? payload.content : '';
    if (!content) return { error: 'No export content to save.' };

    const suggestedPath = path.join(app.getPath('documents'), defaultName);
    try {
      const result = await dialog.showSaveDialog({
        title: 'Export Race Data',
        defaultPath: suggestedPath,
        filters,
      });
      if (result.canceled || !result.filePath) return { cancelled: true };

      await fs.promises.writeFile(result.filePath, content, 'utf8');
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { error: error.message || 'Failed to save export file.' };
    }
  });
  // Provide current telemetry state snapshot (for windows that load late)
  ipcMain.handle('get-state-snapshot', (event) => {
    const context = getContextForWindow(event.sender.id);
    if (!context) {
      return {
        sessionData: null,
        participants: null,
        lapData: null,
        playerCarIndex: 0,
        bestLapTimes: {},
        fastestLap: null,
      };
    }
    const s = context.state;
    return {
      sessionData: s.sessionData,
      participants: s.participants,
      lapData: s.lapData,
      playerCarIndex: s.playerCarIndex,
      bestLapTimes: s.bestLapTimes,
      fastestLap: s.fastestLap,
    };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  disposeTelemetry();
  if (process.platform !== 'darwin') app.quit();
});







