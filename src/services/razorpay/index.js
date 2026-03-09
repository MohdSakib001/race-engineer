function toBasicAuth(keyId, keySecret) {
  return Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

export function getRazorpayAuthHeader({ keyId, keySecret }) {
  return `Basic ${toBasicAuth(keyId, keySecret)}`;
}

export function getRazorpayErrorMessage(data, fallback = 'Razorpay request failed') {
  return data?.error?.description || data?.description || data?.message || fallback;
}

export async function createRazorpayPaymentLinkRequest({
  baseUrl,
  authHeader,
  amountMinor,
  currencyCode,
  description,
  referenceId,
  notes,
}) {
  const res = await fetch(`${baseUrl}/payment_links`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountMinor,
      currency: currencyCode,
      accept_partial: false,
      description,
      reference_id: referenceId,
      notes,
    }),
  });
  return {
    ok: res.ok,
    status: res.status,
    data: await res.json(),
  };
}

export async function fetchRazorpayPaymentLinkRequest({ baseUrl, authHeader, linkId }) {
  const res = await fetch(`${baseUrl}/payment_links/${linkId}`, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  });
  return {
    ok: res.ok,
    status: res.status,
    data: await res.json(),
  };
}
