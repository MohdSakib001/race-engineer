export function registerPaymentAndLicenseIpc(deps) {
  const {
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
  } = deps;

  ipcMain.handle('get-license', () => loadLicenseMain());
  ipcMain.handle('get-pricing-packs', (_, opts) => generateRacePacks(opts));
  ipcMain.handle('get-payment-options', () => {
    const providers = getPaymentProviders();
    const defaultProvider = providers.find((provider) => provider.configured) || providers[0] || {
      id: 'paypal',
      label: 'PayPal',
      defaultCurrency: 'USD',
      supportedCurrencies: ['USD'],
    };
    return {
      defaultProvider: defaultProvider.id,
      defaultCurrency: defaultProvider.defaultCurrency,
      supportedCurrencies: defaultProvider.supportedCurrencies,
      providers,
    };
  });

  ipcMain.handle('set-byok-mode', (_, { enabled }) => {
    const lic = loadLicenseMain();
    const updated = { ...lic, byokMode: !!enabled };
    const saved = saveLicenseMain(updated);
    broadcastLicense(saved);
    return { success: true, license: saved };
  });

  const PAYPAL_SUCCESS_URL = 'race-engineer://paypal-success?pack_id={pack_id}';
  const PAYPAL_CANCEL_URL = 'race-engineer://paypal-cancel';
  const pendingPaymentOrders = new Map();

  ipcMain.handle('stripe-checkout', async (_, { packId, raceLaps, racePercent, activeSituations, currencyCode, provider }) => {
    const paymentProvider = getPaymentProvider(String(provider || '').trim().toLowerCase());
    if (!paymentProvider?.id) return { error: 'No payment provider configured.' };

    const selectedCurrency = String(currencyCode || paymentProvider.defaultCurrency).trim().toUpperCase();
    const packs = generateRacePacks({ raceLaps, racePercent, activeSituations, currencyCode: selectedCurrency });
    const pack = packs.find((p) => p.id === packId);
    if (!pack) return { error: `Unknown pack: ${packId}` };

    logPaymentEventMain({
      provider: paymentProvider.id,
      stage: 'checkout_requested',
      level: 'info',
      packId,
      status: `${paymentProvider.label} ${selectedCurrency}`.trim(),
      message: `Checkout requested for ${pack.label} (${pack.priceDisplay}).`,
    });

    let result;
    if (paymentProvider.id === 'razorpay') {
      result = await createRazorpayPaymentLink(pack, { currencyCode: selectedCurrency });
    } else {
      const returnUrl = PAYPAL_SUCCESS_URL.replace('{pack_id}', packId);
      result = await createPayPalOrder(pack, returnUrl, PAYPAL_CANCEL_URL, { currencyCode: selectedCurrency });
    }

    if (result?.error) {
      logPaymentEventMain({
        provider: paymentProvider.id,
        stage: 'order_create_failed',
        level: 'error',
        packId,
        status: `${paymentProvider.label} ${selectedCurrency}`.trim(),
        message: `${paymentProvider.label} checkout creation failed: ${result.error}`,
      });
      return { error: result.error };
    }

    pendingPaymentOrders.set(result.orderId, {
      provider: paymentProvider.id,
      packId,
      raceLaps,
      racePercent,
      activeSituations,
      currencyCode: result.currencyCode || selectedCurrency,
    });

    logPaymentEventMain({
      provider: paymentProvider.id,
      stage: 'order_created',
      level: 'info',
      orderId: result.orderId,
      packId,
      status: `${paymentProvider.label} ${result.currencyCode || selectedCurrency} ${result.amountValue || ''}`.trim(),
      message: `${paymentProvider.label} checkout created.`,
    });

    return {
      url: result.url,
      orderId: result.orderId,
      provider: paymentProvider.id,
      currencyCode: result.currencyCode || selectedCurrency,
      amountValue: result.amountValue || null,
    };
  });

  ipcMain.handle('stripe-verify-session', async (_, { sessionId: orderId, packId, raceLaps, racePercent, activeSituations, currencyCode, provider }) => {
    const pendingOrder = pendingPaymentOrders.get(orderId);
    const paymentProvider = getPaymentProvider(String(provider || pendingOrder?.provider || '').trim().toLowerCase());
    const requestedPackId = packId || pendingOrder?.packId || null;
    const requestedCurrency = String(currencyCode || pendingOrder?.currencyCode || paymentProvider.defaultCurrency)
      .trim()
      .toUpperCase();

    logPaymentEventMain({
      provider: paymentProvider.id,
      stage: 'verify_requested',
      level: 'info',
      orderId,
      packId: requestedPackId,
      status: `${paymentProvider.label} ${requestedCurrency}`.trim(),
      message: 'Payment verification requested.',
    });

    const existing = loadLicenseMain();
    if (Array.isArray(existing.processedOrderIds) && existing.processedOrderIds.includes(orderId)) {
      return {
        success: true,
        duplicate: true,
        license: existing,
        licenseKey: existing.lastIssuedLicenseKey || existing.licenseKey || null,
      };
    }

    const captured = paymentProvider.id === 'razorpay'
      ? await fetchRazorpayPaymentLink(orderId)
      : await capturePayPalOrder(orderId, requestedPackId);

    if (!captured.success) {
      if (captured.pending) {
        logPaymentEventMain({
          provider: paymentProvider.id,
          stage: 'verify_pending',
          level: 'info',
          orderId,
          packId: requestedPackId,
          status: `${paymentProvider.label} ${captured.status || 'PENDING'} ${requestedCurrency}`.trim(),
          message: captured.error || 'Payment is not completed yet.',
        });
        return {
          pending: true,
          status: captured.status || null,
          error: captured.error || 'Payment not completed yet',
        };
      }
      logPaymentEventMain({
        provider: paymentProvider.id,
        stage: 'verify_failed',
        level: 'error',
        orderId,
        packId: requestedPackId,
        status: `${paymentProvider.label} ${captured.status || 'FAILED'} ${requestedCurrency}`.trim(),
        message: captured.error || 'Payment capture failed',
      });
      return { error: captured.error || 'Payment capture failed' };
    }

    const resolvedPackId = captured.packId || requestedPackId;
    const resolvedCurrency = String(captured.currencyCode || requestedCurrency || paymentProvider.defaultCurrency)
      .trim()
      .toUpperCase();
    const packs = generateRacePacks({ raceLaps, racePercent, activeSituations, currencyCode: resolvedCurrency });
    const pack = packs.find((p) => p.id === resolvedPackId || p.id === requestedPackId);
    if (!pack) {
      logPaymentEventMain({
        provider: paymentProvider.id,
        stage: 'verify_failed',
        level: 'error',
        orderId,
        packId: resolvedPackId || requestedPackId,
        status: `${paymentProvider.label} ${captured.paymentStatus || 'COMPLETED'} ${resolvedCurrency}`.trim(),
        message: `Unknown pack after capture: ${resolvedPackId}`,
      });
      return { error: `Unknown pack after capture: ${resolvedPackId}` };
    }
    pendingPaymentOrders.delete(orderId);

    let licenseKey = null;
    let activationResult = null;
    let activationWarning = null;
    if (isDevMode() || String(orderId || '').startsWith('DEV_')) {
      licenseKey = `RE-DEV-SESSION-${pack.count}`;
    } else {
      licenseKey = generateLicenseKeyFromOrder(orderId);
      const registered = await registerLicenseKey(licenseKey, pack, captured.txId);
      const alreadyRegistered = /already registered/i.test(String(registered?.error || ''));
      if (!registered?.success && !alreadyRegistered) {
        logPaymentEventMain({
          provider: paymentProvider.id,
          stage: 'license_register_failed',
          level: 'error',
          orderId,
          packId: pack.id,
          txId: captured.txId,
          licenseKey,
          message: registered?.error || 'Failed to register license key with worker.',
        });
        return { error: registered?.error || 'License registration failed after payment capture.' };
      }
      const machineId = getMachineId(app.getPath('userData'));
      const { hostname } = await import('node:os');
      activationResult = await activateLicenseKey(licenseKey, machineId, hostname());
      if (!activationResult?.success) {
        activationWarning = activationResult?.error || 'Failed to auto-activate license key.';
        logPaymentEventMain({
          provider: paymentProvider.id,
          stage: 'license_activation_pending',
          level: 'warn',
          orderId,
          packId: pack.id,
          txId: captured.txId,
          licenseKey,
          status: `${paymentProvider.label} ${resolvedCurrency}`.trim(),
          message: `${activationWarning} You can still activate this key manually from Settings.`,
        });
      }
    }

    const lic = loadLicenseMain();
    if (Array.isArray(lic.processedOrderIds) && lic.processedOrderIds.includes(orderId)) {
      return {
        success: true,
        duplicate: true,
        license: lic,
        licenseKey: lic.lastIssuedLicenseKey || lic.licenseKey || null,
      };
    }

    const activationSucceeded = isDevMode() || String(orderId || '').startsWith('DEV_') || !!activationResult?.success;
    const statusText = `${paymentProvider.label} ${captured.paymentStatus || 'COMPLETED'} ${captured.currencyCode || resolvedCurrency} ${captured.amountValue || ''}`.trim();
    const updated = activationSucceeded
      ? applyPurchase(lic, pack, captured.txId, {
        provider: paymentProvider.id,
        amount: captured.amountValue ? `${captured.currencyCode || resolvedCurrency} ${captured.amountValue}`.trim() : pack.priceDisplay,
        currencyCode: captured.currencyCode || resolvedCurrency,
      })
      : { ...lic };
    updated.processedOrderIds = [...(updated.processedOrderIds || []), orderId].slice(-300);
    if (activationResult?.success) {
      applySharedCreditAliases(updated, getSyncedCredits(activationResult, updated.creditsRemaining));
    }
    if (licenseKey) {
      const purchases = updated.purchases || [];
      if (activationSucceeded && purchases.length > 0) purchases[purchases.length - 1].licenseKey = licenseKey;
      if (activationSucceeded) updated.licenseKey = licenseKey;
      updated.lastIssuedLicenseKey = licenseKey;
    }
    saveLicenseMain(updated);

    const withEvent = logPaymentEventMain({
      provider: paymentProvider.id,
      stage: activationSucceeded ? 'payment_captured' : 'payment_captured_needs_activation',
      level: activationSucceeded ? 'success' : 'warn',
      orderId,
      packId: pack.id,
      txId: captured.txId,
      status: statusText,
      licenseKey,
      message: activationSucceeded
        ? `Payment captured and credits granted (${pack.label}).`
        : `Payment captured for ${pack.label}. Activate key ${licenseKey} in Settings to use credits on this machine.`,
    });
    return {
      success: true,
      license: withEvent,
      licenseKey,
      provider: paymentProvider.id,
      needsActivation: !activationSucceeded,
      warning: activationWarning,
    };
  });

  ipcMain.handle('start-dev-session', () => {
    if (!isDevMode()) return { error: 'Dev mode not active' };
    const lic = loadLicenseMain();
    const updated = applySharedCreditAliases({ ...lic, devMode: true }, 999);
    saveLicenseMain(updated);
    broadcastLicense(updated);
    return { success: true, license: updated };
  });

  ipcMain.handle('activate-license-key', async (_, { licenseKey }) => {
    if (!licenseKey || typeof licenseKey !== 'string') return { error: 'Invalid license key.' };
    const key = licenseKey.trim().toUpperCase();
    if (!key.startsWith('RE-')) return { error: 'License key must start with RE-' };

    const machineId = getMachineId(app.getPath('userData'));
    const { hostname } = await import('node:os');
    const machineLabel = hostname();

    const result = await activateLicenseKey(key, machineId, machineLabel);
    if (!result.success) return { error: result.error || 'Activation failed.' };

    const lic = loadLicenseMain();
    const alreadyRedeemed = (lic.purchases || []).some((purchase) => purchase.txId === key);
    let updated = { ...lic };

    if (hasCreditPayload(result)) {
      updated = applySharedCreditAliases(updated, getSyncedCredits(result, updated.creditsRemaining));
    } else if (!alreadyRedeemed) {
      const pack = { id: result.packId || key, type: result.packType || 'session', count: result.packCount };
      updated = applyPurchase(updated, pack, key);
    }

    updated.licenseKey = key;
    updated.machineId = machineId;
    updated.lastIssuedLicenseKey = updated.lastIssuedLicenseKey || key;
    const saved = saveLicenseMain(updated);
    const logged = logPaymentEventMain({
      stage: 'license_activated',
      level: 'info',
      packId: result.packId || null,
      licenseKey: key,
      status: result.mode || 'activated',
      message: alreadyRedeemed
        ? 'License activated. Existing remaining credits synced.'
        : 'License activated successfully.',
    });
    const creditsRemaining = getSyncedCredits(result, saved.creditsRemaining);
    return {
      success: true,
      license: logged || saved,
      packType: result.packType || 'session',
      packCount: result.packCount,
      creditsRemaining,
      racesRemaining: creditsRemaining,
      qualifyingRemaining: creditsRemaining,
      exhausted: result.exhausted,
    };
  });

  ipcMain.handle('deactivate-license-key', async () => {
    const lic = loadLicenseMain();
    if (!lic.licenseKey) return { error: 'No active license key on this machine.' };
    const machineId = getMachineId(app.getPath('userData'));
    const result = await deactivateLicenseKey(lic.licenseKey, machineId);
    if (!result.success) return { error: result.error || 'Deactivation failed.' };
    const updated = { ...lic, licenseKey: null, machineId: null };
    saveLicenseMain(updated);
    const logged = logPaymentEventMain({
      stage: 'license_deactivated',
      level: 'info',
      message: 'License deactivated on this machine.',
    });
    return { success: true, license: logged };
  });
}

