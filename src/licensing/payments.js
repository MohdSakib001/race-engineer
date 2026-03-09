import {
  fetchPayPalAccessToken,
  getPayPalErrorMessage,
  createPayPalOrderRequest,
  fetchPayPalOrderRequest,
  capturePayPalOrderRequest,
} from '../services/paypal/index.js';
import {
  getRazorpayAuthHeader,
  getRazorpayErrorMessage,
  createRazorpayPaymentLinkRequest,
  fetchRazorpayPaymentLinkRequest,
} from '../services/razorpay/index.js';
import {
  PAYPAL_BASE_URL,
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  RAZORPAY_BASE_URL,
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  isDevMode,
} from './env.js';
import {
  currencyFractionDigits,
  fromMinorUnits,
  getDefaultRazorpayCurrency,
  isRazorpayConfigured,
  normalizePayPalCurrencyCode,
  normalizeRazorpayCurrencyCode,
  toCurrencyAmount,
  toMinorUnits,
  usdToCurrency,
} from './currency.js';

async function paypalAccessToken() {
  return fetchPayPalAccessToken({
    baseUrl: PAYPAL_BASE_URL,
    clientId: PAYPAL_CLIENT_ID,
    clientSecret: PAYPAL_CLIENT_SECRET,
  });
}

function paypalErrorMessage(data, fallback = 'PayPal request failed') {
  return getPayPalErrorMessage(data, fallback);
}

function razorpayAuthHeader() {
  return getRazorpayAuthHeader({
    keyId: RAZORPAY_KEY_ID,
    keySecret: RAZORPAY_KEY_SECRET,
  });
}

function razorpayErrorMessage(data, fallback = 'Razorpay request failed') {
  return getRazorpayErrorMessage(data, fallback);
}

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
    const { ok, status, data: order } = await createPayPalOrderRequest({
      baseUrl: PAYPAL_BASE_URL,
      accessToken: token,
      currencyCode,
      amountValue,
      description: `Race Engineer - ${pack.label}`,
      packId: pack.id,
      returnUrl,
      cancelUrl,
    });
    if (!ok || order.error || !order.id) {
      return { error: paypalErrorMessage(order, `PayPal order creation failed (${status})`) };
    }
    const approvalLink = order.links?.find((link) => link.rel === 'approve')?.href;
    if (!approvalLink) return { error: 'No PayPal approval URL returned' };
    return { url: approvalLink, orderId: order.id, currencyCode, amountValue };
  } catch (e) {
    return { error: e.message };
  }
}

export async function capturePayPalOrder(orderId, packId) {
  if (isDevMode() || String(orderId || '').startsWith('DEV_ORDER_')) {
    return { success: true, paymentStatus: 'COMPLETED', txId: orderId, packId };
  }
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return { success: false, error: 'PayPal not configured' };
  }

  try {
    const token = await paypalAccessToken();
    const { data: orderData } = await fetchPayPalOrderRequest({
      baseUrl: PAYPAL_BASE_URL,
      accessToken: token,
      orderId,
    });
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

    const { data } = await capturePayPalOrderRequest({
      baseUrl: PAYPAL_BASE_URL,
      accessToken: token,
      orderId,
    });

    const alreadyCaptured = data?.details?.some((detail) => detail?.issue === 'ORDER_ALREADY_CAPTURED');
    if (alreadyCaptured) {
      const { data: latest } = await fetchPayPalOrderRequest({
        baseUrl: PAYPAL_BASE_URL,
        accessToken: token,
        orderId,
      });
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

    const { ok, status, data } = await createRazorpayPaymentLinkRequest({
      baseUrl: RAZORPAY_BASE_URL,
      authHeader: razorpayAuthHeader(),
      amountMinor: toMinorUnits(amountValue, currencyCode),
      currencyCode,
      description: `Race Engineer - ${pack.label}`,
      referenceId,
      notes: {
        packId: pack.id,
        packLabel: pack.label,
      },
    });
    if (!ok || !data?.id || !data?.short_url) {
      return { error: razorpayErrorMessage(data, `Razorpay payment link creation failed (${status})`) };
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
    const { ok, status: responseStatus, data } = await fetchRazorpayPaymentLinkRequest({
      baseUrl: RAZORPAY_BASE_URL,
      authHeader: razorpayAuthHeader(),
      linkId,
    });
    if (!ok || !data?.id) {
      return { success: false, error: razorpayErrorMessage(data, `Razorpay payment lookup failed (${responseStatus})`) };
    }

    const paymentStatus = String(data.status || '').toLowerCase();
    if (paymentStatus !== 'paid') {
      const pending = !['cancelled', 'expired', 'failed'].includes(paymentStatus);
      return {
        success: false,
        pending,
        status: paymentStatus ? paymentStatus.toUpperCase() : 'PENDING',
        error: `Payment status: ${paymentStatus || 'pending'}`,
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

