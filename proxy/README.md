# f1-replay — OpenF1 Proxy (Cloudflare Worker)

A Cloudflare Worker that proxies the [OpenF1 REST API](https://openf1.org/) and caches JSON responses in **Cloudflare KV**, eliminating browser-side rate-limit pressure (3 req/s, 30 req/min) and making historical sessions load instantly for every user.

## Device notifications (phase 1)

The Worker also supports opt-in encrypted Web Push **test notifications**.
Automatic reminders, session-start detection, results alerts and queues are not
implemented yet. `PUSH_ENABLED` defaults to `"false"`; no D1 resources are needed
to continue deploying the existing proxy with notifications disabled.

The frontend manifest allows Home Screen installation. The root service worker
handles only push and notification clicks; it does not intercept requests,
cache bundles, or force updates.

### Provisioning

Run these commands only in the intended Cloudflare account:

```bash
cd proxy
yarn install --frozen-lockfile
yarn wrangler d1 create f1-replay-notifications
yarn push:keys
```

1. Uncomment the `NOTIFICATIONS` D1 binding in `wrangler.toml`, using the actual
   database ID from the create command. Keep `PUSH_ENABLED = "false"`.
2. Set `VAPID_PUBLIC_KEY` and a valid `VAPID_SUBJECT` contact (`mailto:` or HTTPS)
   under `[vars]`. Store only the private key as a secret:
   `yarn wrangler secret put VAPID_PRIVATE_KEY`. Never commit generated private keys.
3. Configure `PUSH_ORIGINS` as a comma-separated exact origin allowlist.
   The default is `https://f1replay.app`. Local development must explicitly add
   its Vite origin, for example `http://localhost:5173`.
4. Apply the schema: `yarn push:migrate` (remote), or
   `yarn wrangler d1 migrations apply NOTIFICATIONS --local` for local tests.
5. Uncomment the daily cron trigger. This is required for 180-day inactive
   subscription retention and registration-counter cleanup, not session alerts.
6. Deploy the backend before enabling frontend tests. Change
   `PUSH_ENABLED = "true"` only after the database, schema, keys, origins and
   cleanup trigger are configured, then redeploy.

The Deploy Proxy workflow type-checks and runs D1-backed integration tests before
deployment. Its manual `migrate_notifications` input applies migrations before
deploying. Use that input (or apply migrations manually) for future schema changes;
push-triggered deployments do not automatically migrate the database.

The frontend defaults to `https://proxy.f1replay.app`. Set `VITE_PUSH_API_BASE`
(a Worker origin without `/v1`) for local or alternative deployments. The Pages
workflow accepts this through the repository variable of the same name.
For local development use `http://localhost:8787`; ensure Wrangler supplies
`CF-Connecting-IP`, which registration requires for throttling.

### API and ownership

| Route | Behavior |
| --- | --- |
| `GET /notifications/config` | Enabled state and public VAPID key; reports automatic alerts unavailable |
| `POST /notifications/subscriptions` | Register/refresh this device's browser subscription |
| `GET /notifications/subscription` | Reconcile subscription state and refresh last-seen timestamp |
| `DELETE /notifications/subscription` | Delete this device's subscription, including while sending is disabled |
| `POST /notifications/test` | Send a test, at most once per minute per device |

All routes require an allowed `Origin`; management routes also require a
high-entropy device bearer credential. The browser generates and persists it
**before** registration, and D1 stores only its hash. Retrying registration
cannot transfer an existing endpoint to another credential. A changed browser
endpoint replaces the same device's previous endpoint.

Device credentials, permission and subscription material are separate from
portable settings and never exported. If local storage is lost while the
browser subscription remains, disable it locally and enable again rather than
trying to take ownership of an endpoint without its credential.

Responses are `no-store` with notification-specific CORS; `/v1` public proxy
CORS and caching are unchanged. Registration is limited to 10 attempts per
minute per secret-salted network-address hash. Expired buckets are deleted by
daily cleanup. Tests are atomically limited per device, with no automatic
retry. Provider `404`/`410` removes the subscription; other provider/network
failures surface explicitly. Outbound push destinations are restricted to
supported Apple, Google, Mozilla and Microsoft HTTPS hosts, with redirects
disabled. Provider response bodies, endpoint URLs and device keys are not logged.

The maintained `@block65/webcrypto-web-push` v2 dependency uses `aes128gcm`
encryption and RFC 8292 VAPID authorization required by Apple. Rotating VAPID
keys requires existing devices to disable and re-enable their subscriptions;
do not casually replace the private key.

### Verification and rollback

```bash
# From the repository root, after installing both root and proxy dependencies:
yarn --cwd proxy type-check
yarn vitest run --config proxy/vitest.config.ts
```

Then verify on a real iPhone/iPad with iOS/iPadOS 16.4+:

1. Add the site to the Home Screen and launch it from its icon.
2. Open Settings -> Alerts -> Device notifications and explicitly enable.
3. Send a test; verify delivery while the app is closed, including Lock Screen.
4. Tap it and verify the Home page opens in the installed app.
5. Disable notifications and confirm the server record is removed. Partial
   deletion failures must remain retryable.

An accepted push request is **not** proof that a device displayed it; OS
settings and delivery delays apply. Real-device validation is still required.
To pause delivery, set `PUSH_ENABLED = "false"` and redeploy. Keep the D1 binding
and cleanup cron so existing users can still delete subscriptions and stale
records are removed. A missing required binding/key with sending enabled
produces an explicit 503 rather than silently pretending to be configured.

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

The GitHub workflow `.github/workflows/warm-cache.yml` runs hourly on race-weekend days (Thu–Sun UTC, plus an early-Monday catch-up) and once a day on Tuesday/Wednesday, detects sessions that ended 40 min – 52 h ago, and replays every canonical app URL for them through the proxy (`scripts/warm-proxy-cache.mjs`) — static endpoints, 2-min location chunks and 5-min car_data chunks — self-throttled under the OpenF1 rate limits. The first real visitor then gets cache hits everywhere.

Every run also **backfills season results**: it lists each season's sessions (2023 → now) through the proxy and requests `session_result` for every finished Race, Sprint and main Qualifying, plus `championship_drivers` / `championship_teams` for every Race and Sprint — exactly what the Standings page (wins/podiums, points progression, teammate head-to-heads) fetches. Results are cached forever, so only missing ones reach OpenF1; a fully-warmed run takes under a second. Tune with `RESULTS_BACKFILL=0` (disable) or `RESULTS_BACKFILL_FROM_YEAR`.

Freshly-finished sessions' mutable data — `session_result`, `championship_*`, `starting_grid`, `laps`, `pit`, `stints`, `race_control`, `team_radio`, `overtakes`, `drivers` — is warmed with `X-Warm-Refresh: 1` on every run inside the lookback window (52 h in the workflow), so a provisional classification, a late stewards' penalty or late-published data replaces the cached copy. The Worker compares the refetched body with the KV copy and only rewrites KV when the data changed, reporting `X-Warm-Updated: 1` (changed) or `0` (unchanged); the run summary counts both.

Run logs are grouped into collapsible sections (configuration, session discovery with why each nearby session was or wasn't picked, one section per warmed session and per backfilled season). Each request logs its cache state, HTTP status, size, latency and refresh outcome. Changed entries are raised as `notice` annotations and failures as `warning` annotations, and both are listed in the job summary. Disable the per-request lines with the `log_requests` workflow input (`WARM_LOG_REQUESTS=0`).

Two request headers enhance warm runs when the `WARM_SECRET` Worker secret is set:

| Header | Effect |
|--------|--------|
| `X-Warm-Secret: <secret>` | Response is cached as historical (**90 days** in KV), even for endpoints whose URL alone can't prove they're historical (`laps`, `position`, `intervals`, `weather`, …) |
| `X-Warm-Refresh: 1` | Bypasses the cache read and re-fetches from OpenF1 — used to keep the long-cached `meetings`/`sessions` lists current mid-season, and to re-fetch a recently-finished session's results and other mutable data. KV is only rewritten when the body changed (`X-Warm-Updated: 1\|0` in the response) |

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
