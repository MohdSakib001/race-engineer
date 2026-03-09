export function createLicenseRuntime(deps) {
  const {
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
  } = deps;

  function licensePath() {
    return path.join(app.getPath('userData'), 'race-engineer-license.json');
  }

  function hasCreditPayload(value) {
    return Number.isFinite(Number(value?.creditsRemaining))
      || Number.isFinite(Number(value?.racesRemaining))
      || Number.isFinite(Number(value?.qualifyingRemaining));
  }

  function getSyncedCredits(value, fallback = 0) {
    return hasCreditPayload(value) ? getResolvedCreditsRemaining(value) : Math.max(0, Number(fallback || 0));
  }

  function normalizeLicenseMain(license) {
    const normalized = { ...license };
    if (!Array.isArray(normalized.purchases)) normalized.purchases = [];
    if (!Array.isArray(normalized.paymentEvents)) normalized.paymentEvents = [];
    if (!Array.isArray(normalized.processedOrderIds)) normalized.processedOrderIds = [];

    if (!isDevMode()) {
      const hadPersistedDevMode = normalized.devMode === true;
      normalized.devMode = false;
      const activeKey = String(normalized.licenseKey || '').trim().toUpperCase();
      const lastKey = String(normalized.lastIssuedLicenseKey || '').trim().toUpperCase();
      if (hadPersistedDevMode && !activeKey) {
        applySharedCreditAliases(normalized, 0);
        normalized.machineId = null;
      }
      if (activeKey.startsWith('RE-DEV-')) {
        normalized.licenseKey = null;
        normalized.machineId = null;
        applySharedCreditAliases(normalized, 0);
      }
      if (!normalized.licenseKey && lastKey.startsWith('RE-DEV-')) {
        normalized.lastIssuedLicenseKey = null;
      }
    }

    const credits = normalized.devMode || isDevMode()
      ? 999
      : getResolvedCreditsRemaining(normalized);
    applySharedCreditAliases(normalized, credits);

    if (normalized.devMode || isDevMode()) {
      normalized.licenseStatus = 'dev';
      normalized.licenseExhaustedAt = null;
      return normalized;
    }
    if (normalized.byokMode) {
      normalized.licenseStatus = 'byok';
      normalized.licenseExhaustedAt = null;
      return normalized;
    }
    if (!normalized.licenseKey) {
      normalized.licenseStatus = 'no-key';
      normalized.licenseExhaustedAt = null;
      return normalized;
    }
    if ((normalized.creditsRemaining || 0) <= 0) {
      normalized.licenseStatus = 'exhausted';
      normalized.licenseExhaustedAt = normalized.licenseExhaustedAt || new Date().toISOString();
    } else {
      normalized.licenseStatus = 'active';
      normalized.licenseExhaustedAt = null;
    }
    return normalized;
  }

  function loadLicenseMain() {
    const lic = normalizeLicenseMain(loadLicense(licensePath()));
    if (isDevMode()) {
      lic.devMode = true;
      applySharedCreditAliases(lic, 999);
    }
    return normalizeLicenseMain(lic);
  }

  async function validateLicenseOnStartup() {
    const lic = loadLicenseMain();
    if (!lic.licenseKey || lic.devMode || lic.byokMode) return;
    if (lic.licenseKey.startsWith('RE-DEV-')) return;

    const machineId = getMachineId(app.getPath('userData'));
    try {
      const result = await validateLicenseKey(lic.licenseKey, machineId);
      if (result.valid === false) {
        const revoked = applySharedCreditAliases({ ...lic, licenseKey: null, machineId: null }, 0);
        const saved = saveLicenseMain(revoked);
        broadcastLicense(saved);
        return;
      }
      if (result.valid === true) {
        const synced = applySharedCreditAliases({
          ...lic,
          machineId,
        }, getSyncedCredits(result, lic.creditsRemaining));
        const saved = saveLicenseMain(synced);
        broadcastLicense(saved);
      }
    } catch {}
  }

  function saveLicenseMain(license) {
    const normalized = normalizeLicenseMain(license);
    saveLicense(licensePath(), normalized);
    return normalized;
  }

  function broadcastLicense(license) {
    const normalized = normalizeLicenseMain(license);
    for (const win of allWindows) {
      if (!win.isDestroyed()) win.webContents.send('license-update', normalized);
    }
  }

  function logPaymentEventMain(event) {
    const lic = loadLicenseMain();
    const updated = recordPaymentEvent(lic, event);
    const saved = saveLicenseMain(updated);
    broadcastLicense(saved);
    return saved;
  }

  function getPaymentProviders() {
    return [
      {
        id: 'paypal',
        label: 'PayPal',
        configured: isDevMode() || isPayPalConfigured(),
        defaultCurrency: getDefaultPayPalCurrency(),
        supportedCurrencies: getSupportedPayPalCurrencies(),
      },
      {
        id: 'razorpay',
        label: 'Razorpay',
        configured: isDevMode() || isRazorpayConfigured(),
        defaultCurrency: getDefaultRazorpayCurrency(),
        supportedCurrencies: getSupportedRazorpayCurrencies(),
      },
    ];
  }

  function getPaymentProvider(providerId) {
    const providers = getPaymentProviders();
    const fallback = providers.find((provider) => provider.configured) || providers[0] || {
      id: 'paypal',
      label: 'PayPal',
      configured: isDevMode() || isPayPalConfigured(),
      defaultCurrency: getDefaultPayPalCurrency(),
      supportedCurrencies: getSupportedPayPalCurrencies(),
    };
    return providers.find((provider) => provider.id === providerId) || fallback;
  }

  return {
    licensePath,
    hasCreditPayload,
    getSyncedCredits,
    normalizeLicenseMain,
    loadLicenseMain,
    validateLicenseOnStartup,
    saveLicenseMain,
    logPaymentEventMain,
    broadcastLicense,
    getPaymentProviders,
    getPaymentProvider,
  };
}
