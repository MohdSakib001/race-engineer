export async function postLicenseWorker({ baseUrl, endpoint, body, headers = {} }) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function registerLicenseWithWorker({
  baseUrl,
  adminSecret,
  licenseKey,
  pack,
  stripeTxId,
}) {
  return postLicenseWorker({
    baseUrl,
    endpoint: '/register',
    headers: { 'X-Admin-Secret': adminSecret },
    body: {
      licenseKey,
      packId: pack.id,
      packType: pack.type,
      packCount: pack.count,
      stripeTxId,
    },
  });
}
