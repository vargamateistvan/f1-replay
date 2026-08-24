# f1-replay — OpenF1 Proxy (Cloudflare Worker)

A Cloudflare Worker that proxies the [OpenF1 REST API](https://openf1.org/) and caches JSON responses in **Cloudflare KV**, eliminating browser-side rate-limit pressure (3 req/s, 30 req/min) and making historical sessions load instantly for every user.

## How it works

```
Browser (f1-replay SPA)
    │  GET /v1/location?session_key=…
    ▼
Cloudflare Worker  (this project, runs at the edge nearest the user)
    │  KV HIT  → return cached JSON, ~1–5 ms
    │  KV MISS → fetch from api.openf1.org, store in KV, return
    ▼
Cloudflare KV  (globally replicated, shared across all users)
    │  (on MISS only)
    ▼
api.openf1.org
```

### Cache TTL strategy

| Bucket | Endpoints | TTL |
|--------|-----------|-----|
| Static metadata | `meetings`, `sessions`, `drivers`, `starting_grid`, `championship_*` | permanent in KV; 30-day browser cache |
| Session results | `session_result` | permanent in KV; 30-day browser cache |
| Historical date-window | `location`, `car_data` where `date<` is in the past | permanent in KV; 30-day browser cache |
| Live date-window | `location`, `car_data` where `date<` is recent | 5 s |
| Live fast feeds | `position`, `intervals`, `laps` | 20 s |
| Live slow feeds | `weather`, `race_control`, `team_radio`, `pit`, `stints`, `overtakes` | 60 s |

Empty `[]` responses are **never cached** — live data may not exist yet.

---

## One-time setup

### 1 — Install Wrangler

```bash
npm install -g wrangler   # or: yarn global add wrangler
wrangler login            # opens browser → Cloudflare OAuth
```

### 2 — Create the KV namespace

```bash
cd proxy

# Production namespace
wrangler kv namespace create CACHE
# → 📦 Created namespace "f1-replay-proxy-CACHE"
# → id = "abc123…"  ← copy this

# Preview namespace (used by `wrangler dev`)
wrangler kv namespace create CACHE --preview
# → preview_id = "def456…"  ← copy this
```

Open [`wrangler.toml`](./wrangler.toml) and replace the placeholder IDs:

```toml
[[kv_namespaces]]
binding = "CACHE"
id = "abc123…"          # ← production id
preview_id = "def456…"  # ← preview id
```

### 3 — (Optional) Set your OpenF1 API key

Only needed if you have a paid OpenF1 tier:

```bash
wrangler secret put OPENF1_API_KEY
# Paste your token when prompted
```

### 4 — Deploy

```bash
yarn install
yarn deploy
# → Deployed to https://f1-replay-proxy.<your-subdomain>.workers.dev
```

### 5 — Point the SPA at the proxy

In the main app's `.env.local`:

```env
VITE_OPENF1_API_BASE=https://f1-replay-proxy.<your-subdomain>.workers.dev/v1
```

That's the **only** change needed in the app — `src/api/client.ts` already reads `VITE_OPENF1_API_BASE` and falls back to the public API when unset.

For the GitHub Pages deployment add `VITE_OPENF1_API_BASE` as a secret in the repo settings and pass it in the build step of `.github/workflows/deploy.yml`:

```yaml
- name: Build
  env:
    VITE_APP_VERSION: ${{ github.sha }}
    VITE_OPENF1_API_BASE: ${{ secrets.VITE_OPENF1_API_BASE }}
  run: yarn build
```

---

## Local development

```bash
cd proxy
yarn install
yarn dev          # wrangler dev → http://localhost:8787
```

Then in the app's `.env.local`:

```env
VITE_OPENF1_API_BASE=http://localhost:8787/v1
```

`wrangler dev` uses the `preview_id` KV namespace for local reads/writes so you don't pollute production cache during development.

---

## Automated deployment (GitHub Actions)

The workflow at `.github/workflows/deploy-proxy.yml` automatically deploys the worker whenever files under `proxy/` change on `main`.

Add two secrets to the GitHub repository (**Settings → Secrets → Actions**):

| Secret | Where to get it |
|--------|----------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → right sidebar of any Workers page |

---

## Inspecting cache behaviour

Every response includes an `X-Cache: HIT \| MISS` header — visible in DevTools → Network tab.

To purge specific keys (e.g. after an OpenF1 data correction):

```bash
# List keys
wrangler kv key list --namespace-id=<your-id>

# Delete one key
wrangler kv key delete "openf1:/location?session_key=9158&…" --namespace-id=<your-id>

# Nuke everything (careful — cold cache until warm again)
wrangler kv key list --namespace-id=<your-id> | \
  jq -r '.[].name' | \
  xargs -I{} wrangler kv key delete "{}" --namespace-id=<your-id>
```

---

## Free tier limits

| Resource | Free allowance | Notes |
|----------|---------------|-------|
| Worker requests | 100,000 / day | ~6,500 session loads/day before hitting it |
| KV reads | 100,000 / day | 1 read per cached request |
| KV writes | 1,000 / day | Only on cache MISS |
| KV storage | 1 GB | F1 JSON is tiny; easily holds years of data |

Upgrade to Workers Paid ($5/month) for 10M requests/day and unlimited KV reads if needed.
