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
| Static metadata | `meetings`, `sessions`, `drivers`, `starting_grid` | 90 days in KV; 30-day browser cache |
| `latest` aliases | any request with `meeting_key=latest` / `session_key=latest` | 5 min |
| Session results & standings snapshots | `session_result`, `championship_drivers`, `championship_teams` with a numeric `session_key` | **Forever** in KV (no expiry); 1-day edge/browser cache so corrections propagate |
| Other championship queries | `championship_drivers`, `championship_teams` without a concrete `session_key` | 60 s TTL |
| Historical date-window | `location`, `car_data` where `date<` is in the past | 90 days in KV; 30-day browser cache |
| Live date-window | `location`, `car_data` where `date<` is recent | 5 s |
| Live fast feeds | `position`, `intervals`, `laps` | 20 s |
| Live slow feeds | `weather`, `race_control`, `team_radio`, `pit`, `stints`, `overtakes` | 60 s |

Empty `[]` responses are **never cached** — live data may not exist yet.

Historical KV entries expire after 90 days so old race weekends don't accumulate in storage; an expired entry is transparently re-fetched from OpenF1 on the next request. `session_result` and per-session `championship_*` snapshots are the exception: the Standings page requests them for every round of a season, so they are kept forever to avoid a 429 burst whenever an old season is opened. They are small (≈20 rows per session).

Entries written before the 90-day TTL was introduced have no expiration. Backfill them once (values are preserved, only the expiry is added; `session_result` / `championship_*` keys are skipped):

```bash
cd proxy
export CLOUDFLARE_API_TOKEN=...   # needs "Workers KV Storage: Edit"
export CLOUDFLARE_ACCOUNT_ID=...
yarn kv:expire-legacy             # dry run — lists keys without an expiration
yarn kv:expire-legacy --apply     # re-writes them with a 90-day TTL
```

### Cache warming

The GitHub workflow `.github/workflows/warm-cache.yml` runs hourly on race-weekend days (Thu–Sun UTC, plus an early-Monday catch-up), detects sessions that ended 40 min – 3 h ago, and replays every canonical app URL for them through the proxy (`scripts/warm-proxy-cache.mjs`) — static endpoints, 2-min location chunks and 5-min car_data chunks — self-throttled under the OpenF1 rate limits. The first real visitor then gets cache hits everywhere.

Every run also **backfills season results**: it lists each season's sessions (2023 → now) through the proxy and requests `session_result` for every finished Race, Sprint and main Qualifying, plus `championship_drivers` / `championship_teams` for every Race and Sprint — exactly what the Standings page (wins/podiums, points progression, teammate head-to-heads) fetches. Results are cached forever, so only missing ones reach OpenF1; a fully-warmed run takes under a second. Tune with `RESULTS_BACKFILL=0` (disable) or `RESULTS_BACKFILL_FROM_YEAR`.

Freshly-finished sessions' `session_result` and `championship_*` are warmed with `X-Warm-Refresh: 1` on every run inside the lookback window (24 h in the workflow), so a provisional classification or a late stewards' penalty overwrites the forever-cached copy.

Two request headers enhance warm runs when the `WARM_SECRET` Worker secret is set:

| Header | Effect |
|--------|--------|
| `X-Warm-Secret: <secret>` | Response is cached as historical (**90 days** in KV), even for endpoints whose URL alone can't prove they're historical (`laps`, `position`, `intervals`, `weather`, …) |
| `X-Warm-Refresh: 1` | Bypasses the cache read and re-fetches from OpenF1 — used to keep the long-cached `meetings`/`sessions` lists current mid-season, and to re-fetch a just-finished session's `session_result` / `championship_*` |

Setup:

```bash
# 1 — create the shared secret on the Worker
cd proxy
wrangler secret put WARM_SECRET     # paste a long random string

# 2 — add the same value as a GitHub Actions secret named WARM_SECRET
```

Without `WARM_SECRET` the workflow still warms location/car_data windows and static endpoints (they cache as historical on their own); the live-feed endpoints just keep their short TTLs and session lists aren't refreshed.

You can also warm a specific session manually:

```bash
# via GitHub → Actions → "Warm Proxy Cache" → Run workflow → session_key
# or locally:
PROXY_BASE=https://proxy.f1replay.app/v1 SESSION_KEY=11353 \
  node scripts/warm-proxy-cache.mjs
```

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
