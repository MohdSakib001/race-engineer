# Deploying the License Worker

## One-time setup

```bash
cd worker
npm install -g wrangler
wrangler login

# Create KV namespace
wrangler kv namespace create LICENSE_KV
# Copy the id into wrangler.toml → kv_namespaces[0].id

# Set secrets (never committed to git)
wrangler secret put ADMIN_SECRET       # any strong random string, matches WORKER_ADMIN_SECRET in your .env
wrangler secret put STRIPE_SECRET_KEY  # your Stripe sk_live_xxx or sk_test_xxx

# Deploy
wrangler deploy
# → outputs: https://race-engineer-licensing.YOUR_SUBDOMAIN.workers.dev
# Set that URL as WORKER_URL in your app's environment
```

## Environment variables needed in the Electron app

```
WORKER_URL=https://race-engineer-licensing.YOUR_SUBDOMAIN.workers.dev
WORKER_ADMIN_SECRET=<same value you set as ADMIN_SECRET secret above>
STRIPE_SECRET_KEY=sk_live_xxx
RACE_ENGINEER_OPENAI_KEY=sk-xxx
```

## KV data format

Each activated license key is stored as:
```json
{
  "licenseKey": "RE-XXXX-XXXX-XXXX",
  "packId": "race_5",
  "packType": "race",
  "packCount": 5,
  "stripeTxId": "cs_xxx",
  "registeredAt": "2025-01-01T00:00:00Z",
  "activations": [
    { "machineId": "abc123", "machineLabel": "Ali-PC", "activatedAt": "...", "lastSeen": "..." }
  ],
  "maxActivations": 2
}
```

## Viewing/managing licenses

```bash
# List all keys
wrangler kv key list --namespace-id=YOUR_KV_ID

# Read a specific key
wrangler kv key get "lic:RE-XXXX-XXXX-XXXX" --namespace-id=YOUR_KV_ID

# Delete (force-deactivate all machines)
wrangler kv key delete "lic:RE-XXXX-XXXX-XXXX" --namespace-id=YOUR_KV_ID
```
