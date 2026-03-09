import { escapeHtml } from '../../shared/formatting.js';

export function createPaymentFeature(deps) {
  const {
    state,
    license,
    gptRealtime,
    radio,
    paypalCheckout,
    el,
    countAiEnabledSituations,
    appendRadioCard,
  } = deps;

  function setPurchaseStatus(message) {
    const statusEl = el('modal-stripe-status');
    if (statusEl) statusEl.textContent = message;
  }

  function formatPaymentEventTime(iso) {
    if (!iso) return '-';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  }

  function getLicenseStatusLabel() {
    if (license.devMode) return 'Developer (unlimited)';
    if (license.byokMode) return 'BYOK (own OpenAI key)';
    if (license.licenseStatus === 'exhausted') return 'Exhausted - activate a new key or buy more credits';
    if (license.licenseStatus === 'active') return 'Active';
    if (license.licenseStatus === 'no-key') return 'No key active';
    return 'Subscription';
  }

  function getLicenseModeLabel() {
    if (license.byokMode) return 'BYOK (your key)';
    if (license.devMode) return 'Developer (free)';
    return 'Subscription';
  }

  function getPaymentProviderLabel(providerId) {
    const id = String(providerId || '').trim().toLowerCase();
    if (id === 'razorpay') return 'Razorpay';
    return 'PayPal';
  }

  function renderPaymentEvents(targetId, emptyId, limit = 10) {
    const listEl = el(targetId);
    if (!listEl) return;
    const emptyEl = emptyId ? el(emptyId) : null;
    const events = Array.isArray(license.paymentEvents)
      ? [...license.paymentEvents].slice(-limit).reverse()
      : [];

    if (events.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.textContent = 'No payment events yet.';
      return;
    }
    if (emptyEl) emptyEl.textContent = '';

    listEl.innerHTML = events.map((evt) => {
      const level = String(evt?.level || 'info').toLowerCase();
      const safeLevel = ['success', 'warn', 'error'].includes(level) ? level : 'info';
      const status = evt?.status ? `<span class="payment-log-tag">${escapeHtml(evt.status)}</span>` : '';
      const provider = evt?.provider ? `<span class="payment-log-tag">${escapeHtml(getPaymentProviderLabel(evt.provider))}</span>` : '';
      const order = evt?.orderId ? `<span class="payment-log-tag">Order ${escapeHtml(evt.orderId)}</span>` : '';
      const tx = evt?.txId ? `<span class="payment-log-tag">Tx ${escapeHtml(evt.txId)}</span>` : '';
      const key = evt?.licenseKey ? `<span class="payment-log-tag">Key ${escapeHtml(evt.licenseKey)}</span>` : '';
      return `
        <div class="payment-log-item payment-log-${safeLevel}">
          <div class="payment-log-head">
            <span class="payment-log-stage">${escapeHtml(evt?.stage || 'event')}</span>
            <span class="payment-log-time">${escapeHtml(formatPaymentEventTime(evt?.at))}</span>
          </div>
          <div class="payment-log-message">${escapeHtml(evt?.message || '')}</div>
          <div class="payment-log-meta">${provider}${status}${order}${tx}${key}</div>
        </div>
      `;
    }).join('');
  }

  function refreshLicenseBadges() {
    if (!Array.isArray(license.paymentEvents)) license.paymentEvents = [];
    if (!license.licenseStatus) {
      if (license.devMode) license.licenseStatus = 'dev';
      else if (license.byokMode) license.licenseStatus = 'byok';
      else if (!license.licenseKey) license.licenseStatus = 'no-key';
      else if ((license.creditsRemaining || 0) <= 0) license.licenseStatus = 'exhausted';
      else license.licenseStatus = 'active';
    }

    const creditsText = license.devMode ? 'Unlimited' : String(license.creditsRemaining ?? license.racesRemaining ?? 0);

    const modalCreditsEl = el('mc-credits');
    if (modalCreditsEl) modalCreditsEl.textContent = creditsText;

    const settingsCreditsEl = el('set-credits-remaining');
    if (settingsCreditsEl) settingsCreditsEl.textContent = creditsText;

    const modeEl = el('set-license-mode');
    if (modeEl) modeEl.textContent = getLicenseModeLabel();

    const statusEl = el('set-license-status');
    if (statusEl) statusEl.textContent = getLicenseStatusLabel();

    const exhaustedEl = el('set-license-exhausted-at');
    if (exhaustedEl) {
      exhaustedEl.textContent = license.licenseExhaustedAt
        ? formatPaymentEventTime(license.licenseExhaustedAt)
        : '-';
    }

    const key = license.lastIssuedLicenseKey || license.licenseKey || '-';
    const keyEl = el('set-last-license-key');
    if (keyEl) keyEl.textContent = key;
    const modalKeyEl = el('modal-issued-key');
    if (modalKeyEl) modalKeyEl.textContent = key;

    renderPaymentEvents('set-payment-log-list', 'set-payment-log-empty', 12);
    renderPaymentEvents('modal-payment-log-list', 'modal-payment-log-empty', 6);
  }

  function refreshPurchaseCredits() {
    refreshLicenseBadges();
  }

  function stopPayPalPolling() {
    if (paypalCheckout.pollTimer) {
      clearInterval(paypalCheckout.pollTimer);
      paypalCheckout.pollTimer = null;
    }
  }

  function startPayPalPolling() {
    stopPayPalPolling();
    paypalCheckout.pollTimer = setInterval(() => {
      verifyPendingPayPalOrder({ silentPending: true }).catch(() => {});
    }, 4000);
  }

  async function verifyPendingPayPalOrder({ silentPending = false } = {}) {
    if (!paypalCheckout.pendingOrder || paypalCheckout.verifying) return;
    paypalCheckout.verifying = true;
    try {
      const pending = paypalCheckout.pendingOrder;
      const providerLabel = getPaymentProviderLabel(pending.provider);
      const maxPendingMs = 15 * 60 * 1000;
      if (pending.startedAt && (Date.now() - pending.startedAt) > maxPendingMs) {
        setPurchaseStatus('Payment verification timed out. Click "I completed payment" to retry.');
        stopPayPalPolling();
        return;
      }
      const result = await window.raceEngineer.stripeVerifySession({
        sessionId: pending.orderId,
        packId: pending.packId,
        raceLaps: pending.raceLaps,
        racePercent: pending.racePercent,
        activeSituations: pending.activeSituations,
        currencyCode: pending.currencyCode,
        provider: pending.provider,
      });
      if (result.pending) {
        if (!silentPending) {
          setPurchaseStatus(`Waiting for ${providerLabel} confirmation (${result.status || 'PENDING'})...`);
        }
        return;
      }
      if (result.error) {
        setPurchaseStatus(`${providerLabel} payment verification failed: ${result.error}`);
        stopPayPalPolling();
        return;
      }
      Object.assign(license, result.license);
      refreshPurchaseCredits();
      if (result.needsActivation) {
        const keyText = result.licenseKey ? ` Key: ${result.licenseKey}` : '';
        const warningText = result.warning ? ` (${result.warning})` : '';
        setPurchaseStatus(`${providerLabel} payment captured. Activate your key in Settings.${keyText}`);
        appendRadioCard(
          'system',
          'high',
          `${providerLabel} payment captured but auto-activation failed. Activate key manually from Settings.${keyText}${warningText}`,
          true,
        );
      } else {
        const keyText = result.licenseKey ? ` Key: ${result.licenseKey}` : '';
        setPurchaseStatus(`${providerLabel} payment confirmed. Credits updated.${keyText}`);
      }
      appendRadioCard(
        'system',
        'medium',
        result.needsActivation
          ? `${providerLabel} purchase captured. Activate key ${result.licenseKey || '(see Settings)'} to use credits on this machine.`
          : `${providerLabel} purchase complete. Credits remaining: ${license.creditsRemaining}.`,
        true,
      );
      paypalCheckout.pendingOrder = null;
      stopPayPalPolling();
    } finally {
      paypalCheckout.verifying = false;
    }
  }

  function showPurchaseModal() {
    const existing = el('purchase-modal-overlay');
    if (existing) existing.remove();
    const raceLaps = state.session?.totalLaps || 58;
    const racePercent = 100;
    const activeSits = countAiEnabledSituations(radio.config);
    const overlay = document.createElement('div');
    overlay.id = 'purchase-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-icon">Credits</span>
          <h2>AI Engineer - Credits</h2>
          <button class="modal-close" id="modal-close-btn">X</button>
        </div>
        <div class="modal-tabs">
          <button class="modal-tab active" id="tab-subscription">Buy Credits</button>
          <button class="modal-tab" id="tab-byok">Use My Own Key (Free)</button>
        </div>
        <div id="tab-content-subscription">
          <p class="modal-sub">Credits let you use GPT AI voice with our OpenAI key - no setup needed.
            One credit covers one race or qualifying session. Pricing is based on race length and AI situations enabled.</p>
          <div class="modal-info-row">
            <span>AI situations active: <strong>${activeSits}</strong></span>
            <span>~${raceLaps} laps detected</span>
          </div>
          <div class="settings-field" style="margin-bottom:10px">
            <label>Payment Provider</label>
            <div class="modal-provider-cards" id="modal-provider-cards" role="radiogroup" aria-label="Payment Provider"></div>
          </div>
          <div class="settings-field" style="margin-bottom:10px">
            <label>Checkout Currency</label>
            <select class="settings-input" id="modal-currency-select"></select>
          </div>
          <div id="modal-packs-loading" style="text-align:center;padding:20px;color:var(--text3)">Loading pricing...</div>
          <div id="modal-packs" class="modal-packs hidden"></div>
          <div class="modal-credits">
            <span>Credits remaining: <strong id="mc-credits">${license.devMode ? 'Unlimited' : (license.creditsRemaining ?? license.racesRemaining)}</strong></span>
            ${license.devMode ? '<span class="dev-badge">DEV MODE - Free</span>' : ''}
          </div>
          <div id="modal-stripe-status" style="margin-top:8px;font-size:12px;color:var(--text3);min-height:18px"></div>
          <button class="settings-save-btn" id="modal-verify-btn" style="display:none;margin-top:8px;width:100%">
            I completed payment
          </button>
          <div class="stat-row" style="margin-top:10px">
            <span class="stat-label">Last Issued Key</span>
            <span class="stat-value mono" id="modal-issued-key">${license.lastIssuedLicenseKey || license.licenseKey || '-'}</span>
          </div>
          <div style="margin-top:10px">
            <div class="stat-row"><span class="stat-label">Recent Payment Events</span><span class="stat-value" id="modal-payment-log-empty">No payment events yet.</span></div>
            <div id="modal-payment-log-list" class="payment-log-list"></div>
          </div>
        </div>
        <div id="tab-content-byok" class="hidden">
          <p class="modal-sub">Enter your own OpenAI API key. You pay OpenAI directly at their standard rates.
            No credits needed - free to use in the app.</p>
          <div class="settings-field" style="margin-top:10px">
            <label>Your OpenAI API Key</label>
            <input type="password" class="settings-input" id="byok-key-input" placeholder="sk-..." value="${gptRealtime.openaiApiKey || ''}">
          </div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="settings-save-btn" id="byok-save-btn" style="background:var(--accent);flex:1">Save Key &amp; Enable BYOK</button>
            ${license.byokMode ? '<button class="settings-save-btn" id="byok-disable-btn" style="flex:1">Disable BYOK</button>' : ''}
          </div>
          <p class="settings-note" style="margin-top:8px">
            Get a key at <strong>platform.openai.com/api-keys</strong>.
            BYOK uses <em>gpt-4o-realtime-preview</em> - you will be billed by OpenAI (~$0.06/min audio).
          </p>
          ${license.byokMode ? '<div class="byok-active-badge">BYOK Active - using your own key</div>' : ''}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    el('modal-close-btn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.remove();
    });

    el('tab-subscription').addEventListener('click', () => {
      el('tab-subscription').classList.add('active');
      el('tab-byok').classList.remove('active');
      el('tab-content-subscription').classList.remove('hidden');
      el('tab-content-byok').classList.add('hidden');
    });
    el('tab-byok').addEventListener('click', () => {
      el('tab-byok').classList.add('active');
      el('tab-subscription').classList.remove('active');
      el('tab-content-byok').classList.remove('hidden');
      el('tab-content-subscription').classList.add('hidden');
    });
    if (license.byokMode) {
      el('tab-byok').click();
    }

    el('byok-save-btn')?.addEventListener('click', async () => {
      const key = el('byok-key-input')?.value.trim();
      if (!key || !key.startsWith('sk-')) {
        el('modal-stripe-status').textContent = 'Enter a valid OpenAI key (starts with sk-)';
        return;
      }
      gptRealtime.openaiApiKey = key;
      const result = await window.raceEngineer.setBYOKMode({ enabled: true });
      if (result.success) {
        Object.assign(license, result.license);
        overlay.remove();
        appendRadioCard('system', 'medium', 'BYOK mode enabled. Using your own OpenAI key.', true);
      }
    });
    el('byok-disable-btn')?.addEventListener('click', async () => {
      const result = await window.raceEngineer.setBYOKMode({ enabled: false });
      if (result.success) {
        Object.assign(license, result.license);
        overlay.remove();
        appendRadioCard('system', 'low', 'BYOK disabled. Using subscription credits.', true);
      }
    });
    el('modal-verify-btn')?.addEventListener('click', async () => {
      const verifyBtn = el('modal-verify-btn');
      if (!paypalCheckout.pendingOrder) {
        setPurchaseStatus('No pending payment found. Start checkout again.');
        return;
      }
      if (verifyBtn) {
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Verifying...';
      }
      setPurchaseStatus(`Verifying ${getPaymentProviderLabel(paypalCheckout.pendingOrder.provider)} payment...`);
      await verifyPendingPayPalOrder({ silentPending: false });
      if (verifyBtn) {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'I completed payment';
      }
    });

    refreshLicenseBadges();
    const stripeStatusEl = el('modal-stripe-status');
    const providerCardsEl = el('modal-provider-cards');
    const currencySelectEl = el('modal-currency-select');
    const loadingEl = el('modal-packs-loading');
    const packsEl = el('modal-packs');
    let paymentProviders = [{ id: 'paypal', label: 'PayPal', configured: true, defaultCurrency: 'USD', supportedCurrencies: ['USD'] }];
    let selectedProviderId = paymentProviders[0].id;

    const getSelectedProvider = () => {
      const providerId = selectedProviderId
        || paymentProviders.find((provider) => provider.configured)?.id
        || paymentProviders[0]?.id
        || 'paypal';
      return paymentProviders.find((provider) => provider.id === providerId) || paymentProviders[0];
    };

    const getPaymentProviderSummary = (provider) => {
      if (!provider) return '';
      if (provider.id === 'razorpay') return 'UPI, cards, netbanking, wallets';
      return 'PayPal balance, cards, international checkout';
    };

    const getPaymentProviderBadge = (provider) => {
      if (!provider) return '';
      if (provider.id === 'razorpay') return 'India checkout';
      return 'Global checkout';
    };

    const renderProviderCards = () => {
      if (!providerCardsEl) return;
      providerCardsEl.innerHTML = paymentProviders.map((provider) => {
        const isActive = provider.id === getSelectedProvider()?.id;
        const stateClass = provider.configured
          ? (isActive ? ' payment-provider-card-active' : '')
          : ' payment-provider-card-disabled';
        const markClass = provider.id === 'razorpay'
          ? ' payment-provider-mark-razorpay'
          : ' payment-provider-mark-paypal';
        const currencyList = Array.from(new Set((provider.supportedCurrencies || [provider.defaultCurrency || 'USD'])
          .map((code) => String(code || '').trim().toUpperCase())
          .filter(Boolean)));
        const currencyText = currencyList.join(', ');

        return `
          <button
            type="button"
            class="payment-provider-card${stateClass}"
            data-provider-id="${escapeHtml(provider.id)}"
            role="radio"
            aria-checked="${isActive ? 'true' : 'false'}"
            ${provider.configured ? '' : 'disabled'}
          >
            <div class="payment-provider-card-head">
              <div class="payment-provider-mark${markClass}">${escapeHtml(provider.label)}</div>
              <span class="payment-provider-pill">${escapeHtml(getPaymentProviderBadge(provider))}</span>
            </div>
            <div class="payment-provider-title-row">
              <span class="payment-provider-title">${escapeHtml(provider.label)}</span>
              <span class="payment-provider-radio" aria-hidden="true"></span>
            </div>
            <div class="payment-provider-summary">${escapeHtml(getPaymentProviderSummary(provider))}</div>
            <div class="payment-provider-meta">
              <span>Default ${escapeHtml(provider.defaultCurrency || 'USD')}</span>
              <span>${escapeHtml(currencyText || provider.defaultCurrency || 'USD')}</span>
            </div>
            ${provider.configured ? '' : '<div class="payment-provider-note">Setup required in .env</div>'}
          </button>
        `;
      }).join('');

      providerCardsEl.querySelectorAll('.payment-provider-card').forEach((card) => {
        card.addEventListener('click', async () => {
          const nextProviderId = card.dataset.providerId;
          if (!nextProviderId || nextProviderId === selectedProviderId) return;
          selectedProviderId = nextProviderId;
          renderProviderCards();
          const nextCurrency = renderCurrencyOptions(getSelectedProvider(), currencySelectEl?.value);
          await renderPacksForCurrency(nextCurrency, nextProviderId);
        });
      });
    };

    const renderCurrencyOptions = (provider, preferredCurrency = currencySelectEl?.value) => {
      if (!currencySelectEl || !provider) return provider?.defaultCurrency || 'USD';
      const currencies = Array.from(new Set((provider.supportedCurrencies || [provider.defaultCurrency || 'USD'])
        .map((code) => String(code || '').trim().toUpperCase())
        .filter(Boolean)));
      const resolved = currencies.includes(preferredCurrency)
        ? preferredCurrency
        : (currencies.includes(provider.defaultCurrency) ? provider.defaultCurrency : currencies[0]);
      currencySelectEl.innerHTML = currencies.map((code) => `<option value="${code}">${code}</option>`).join('');
      currencySelectEl.value = resolved;
      currencySelectEl.disabled = provider.configured === false;
      return resolved;
    };

    const renderPacksForCurrency = async (selectedCurrency, providerId = getSelectedProvider()?.id || 'paypal') => {
      if (!packsEl) return;
      const provider = paymentProviders.find((item) => item.id === providerId) || paymentProviders[0];
      const providerLabel = getPaymentProviderLabel(provider?.id);
      if (!provider?.configured) {
        if (loadingEl) loadingEl.style.display = 'none';
        packsEl.classList.remove('hidden');
        packsEl.innerHTML = `<div class="settings-note">${providerLabel} is not configured yet. Add its keys in .env to enable checkout.</div>`;
        return;
      }
      if (loadingEl) {
        loadingEl.style.display = 'block';
        loadingEl.textContent = 'Loading pricing...';
      }
      packsEl.classList.add('hidden');

      const packs = await window.raceEngineer.getPricingPacks({
        raceLaps,
        racePercent,
        activeSituations: activeSits,
        currencyCode: selectedCurrency,
      });

      if (loadingEl) loadingEl.style.display = 'none';
      packsEl.classList.remove('hidden');
      if (!Array.isArray(packs) || packs.length === 0) {
        packsEl.innerHTML = '<div class="settings-note">No packs available right now.</div>';
        return;
      }

      packsEl.innerHTML = packs.map((pack) => `
        <div class="modal-pack-card">
          <div class="pack-label">${pack.label}</div>
          <div class="pack-price">${pack.priceDisplay}</div>
          ${pack.perRaceDisplay ? `<div class="pack-per-race">${pack.perRaceDisplay}</div>` : ''}
          <div class="pack-details">${pack.type === 'qualifying' ? `~${Math.round(pack.minutes)} min` : `${pack.count} race${pack.count > 1 ? 's' : ''}`}</div>
          <button class="settings-save-btn pack-buy-btn" data-pack-id="${pack.id}" style="margin-top:8px;width:100%">
            Pay with ${providerLabel}
          </button>
        </div>
      `).join('');

      packsEl.querySelectorAll('.pack-buy-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const activeProvider = getSelectedProvider();
          const activeProviderLabel = getPaymentProviderLabel(activeProvider?.id);
          const selected = currencySelectEl?.value || selectedCurrency || activeProvider?.defaultCurrency || 'USD';
          btn.disabled = true;
          btn.textContent = 'Opening...';
          if (stripeStatusEl) stripeStatusEl.textContent = `Opening ${activeProviderLabel} Checkout (${selected})...`;
          const result = await window.raceEngineer.stripeCheckout({
            packId: btn.dataset.packId,
            raceLaps,
            racePercent,
            activeSituations: activeSits,
            currencyCode: selected,
            provider: activeProvider?.id,
          });
          btn.disabled = false;
          btn.textContent = `Pay with ${activeProviderLabel}`;
          if (result.error) {
            if (stripeStatusEl) stripeStatusEl.textContent = `Error: ${result.error}`;
            return;
          }

          const opened = await window.raceEngineer.openExternal(result.url);
          if (opened?.error) {
            if (stripeStatusEl) stripeStatusEl.textContent = `Error: ${opened.error}`;
            return;
          }
          paypalCheckout.pendingOrder = {
            orderId: result.orderId,
            provider: result.provider || activeProvider?.id || providerId,
            packId: btn.dataset.packId,
            raceLaps,
            racePercent,
            activeSituations: activeSits,
            currencyCode: result.currencyCode || selected,
            startedAt: Date.now(),
          };
          const verifyBtn = el('modal-verify-btn');
          if (verifyBtn) verifyBtn.style.display = 'block';
          startPayPalPolling();
          if (stripeStatusEl) {
            const amountText = result.amountValue ? `${result.currencyCode || selected} ${result.amountValue}` : (result.currencyCode || selected);
            stripeStatusEl.textContent = opened?.mode === 'deep-link'
              ? `${activeProviderLabel} callback received (${amountText}). Verifying purchase...`
              : `Complete payment in your browser with ${activeProviderLabel} (${amountText}), then click "I completed payment". Auto-check is also running.`;
          }
        });
      });
    };

    const initPaymentOptions = async () => {
      let defaultProviderId = 'paypal';
      try {
        const paymentOptions = await window.raceEngineer.getPaymentOptions();
        if (Array.isArray(paymentOptions?.providers) && paymentOptions.providers.length > 0) {
          paymentProviders = paymentOptions.providers
            .map((provider) => ({
              id: String(provider.id || '').trim().toLowerCase(),
              label: getPaymentProviderLabel(provider.id),
              configured: provider.configured !== false,
              defaultCurrency: String(provider.defaultCurrency || 'USD').trim().toUpperCase(),
              supportedCurrencies: Array.isArray(provider.supportedCurrencies) && provider.supportedCurrencies.length > 0
                ? provider.supportedCurrencies.map((code) => String(code || '').trim().toUpperCase()).filter(Boolean)
                : [String(provider.defaultCurrency || 'USD').trim().toUpperCase()],
            }))
            .filter((provider) => provider.id);
        }
        if (paymentOptions?.defaultProvider) {
          defaultProviderId = String(paymentOptions.defaultProvider).trim().toLowerCase();
        }
      } catch {}

      if (!Array.isArray(paymentProviders) || paymentProviders.length === 0) {
        paymentProviders = [{ id: 'paypal', label: 'PayPal', configured: true, defaultCurrency: 'USD', supportedCurrencies: ['USD'] }];
      }

      const initialProvider = paymentProviders.find((provider) => provider.id === defaultProviderId && provider.configured)
        || paymentProviders.find((provider) => provider.configured)
        || paymentProviders.find((provider) => provider.id === defaultProviderId)
        || paymentProviders[0];
      selectedProviderId = initialProvider.id;
      const initialCurrency = renderCurrencyOptions(initialProvider);

      if (providerCardsEl) renderProviderCards();

      if (currencySelectEl) {
        currencySelectEl.addEventListener('change', async () => {
          const selectedProvider = getSelectedProvider();
          await renderPacksForCurrency(currencySelectEl.value || selectedProvider.defaultCurrency, selectedProvider.id);
        });
      }

      await renderPacksForCurrency(initialCurrency, initialProvider.id);
    };

    initPaymentOptions().catch((error) => {
      if (stripeStatusEl) stripeStatusEl.textContent = `Failed to load payment options: ${error.message}`;
    });
  }

  return {
    setPurchaseStatus,
    formatPaymentEventTime,
    getLicenseStatusLabel,
    getLicenseModeLabel,
    getPaymentProviderLabel,
    refreshLicenseBadges,
    refreshPurchaseCredits,
    stopPayPalPolling,
    startPayPalPolling,
    verifyPendingPayPalOrder,
    showPurchaseModal,
  };
}
