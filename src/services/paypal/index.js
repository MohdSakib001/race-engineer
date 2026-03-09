function toBasicAuth(clientId, clientSecret) {
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

export async function fetchPayPalAccessToken({ baseUrl, clientId, clientSecret }) {
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${toBasicAuth(clientId, clientSecret)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error_description || 'PayPal auth failed');
  return data.access_token;
}

export function getPayPalErrorMessage(data, fallback = 'PayPal request failed') {
  const detail = data?.details?.[0];
  return detail?.description || data?.message || data?.error_description || data?.name || fallback;
}

export async function createPayPalOrderRequest({
  baseUrl,
  accessToken,
  currencyCode,
  amountValue,
  description,
  packId,
  returnUrl,
  cancelUrl,
}) {
  const res = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: currencyCode, value: amountValue },
        description,
        custom_id: packId,
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
  return {
    ok: res.ok,
    status: res.status,
    data: await res.json(),
  };
}

export async function fetchPayPalOrderRequest({ baseUrl, accessToken, orderId }) {
  const res = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  return {
    ok: res.ok,
    status: res.status,
    data: await res.json(),
  };
}

export async function capturePayPalOrderRequest({ baseUrl, accessToken, orderId }) {
  const res = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  return {
    ok: res.ok,
    status: res.status,
    data: await res.json(),
  };
}
