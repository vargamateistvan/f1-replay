# Web Push notifications implementation plan

Status: automatic alert pipeline implemented behind disabled switches; production rollout and device validation pending
Created: 2026-11-12

## Implementation progress

- Implemented manifest/icons, push-only service worker, Alerts settings controls,
  subscription ownership and D1 storage, rate-limited encrypted test sends,
  retryable device unsubscribe and retention cleanup.
- Test sending is provisioned; see `proxy/README.md` for configuration.
- Phase 1 uses `proxy/src/notifications.ts` instead of a module directory. The
  device creates its own high-entropy management credential before registration;
  the backend stores only its hash. This permits ownership-safe registration retries.
- Fresh calendar discovery, D1-backed fan-out and delivery leases, queue
  wake-ups, bounded retries and device preference rechecks are implemented.
  The Schedule page opens results with `?year=<year>&result=<session_key>`.
  The UI exposes alert controls only when the Worker advertises availability.
  All automatic-alert switches remain off in the checked-in configuration.
  Apply migrations and provision queue resources before enabling them.
- The test push provider accepted a request; display on an actual iOS device
  has not been confirmed. Automatic notifications have not been deployed or
  verified against a real weekend; this is not a production-complete feature.
- Event detectors now reject untagged qualifying starts, restarts preceded by
  an interruption, and classifications that do not cover the reported driver
  list. They have Singapore 2023 race-control timing tests using synthetic
  classification rows, but still need broader fixtures, checks for incomplete
  driver lists and real-weekend validation.

## 1. Goal and scope

Let users opt in to device notifications for upcoming F1 sessions, confirmed
session starts, and published results, including when F1 Replay is closed.

Use standards-based Web Push. On iPhone and iPad this requires iOS/iPadOS 16.4
or later, a Home Screen web app, and permission requested after a user action.
No native app or Apple Developer membership is required.

### First-release behavior

| Alert | Trigger | Copy |
| --- | --- | --- |
| Reminder | 10 minutes before the latest known scheduled start | "Qualifying starts in 10 minutes" |
| Started | Fresh, explicit race-control evidence of the session starting | "Qualifying has started" |
| Results | Non-empty, validated classification after session completion | "Qualifying results are available" |

- Notifications are off until explicitly enabled on the current device.
- Each alert type has an independent toggle.
- Session filters cover Race, Sprint, Qualifying, Sprint Qualifying/Sprint
  Shootout, and Practice. Default to races, sprints, and both qualifying types.
- Subscriptions apply to all upcoming F1 weekends matching these filters.
- Reminder lead time is fixed at 10 minutes in the first release.
- Permission, subscriptions, and enabled state belong to the device installation.
- Results are not described as "final"; classifications may subsequently change.
- Delivery is best-effort, not an exact-time or exactly-once guarantee.

### Out of scope

Offline replay, native apps, user accounts, email/SMS, driver-specific alerts,
race-control streams, corrected-results alerts, configurable reminder lead
times, and per-weekend subscriptions.

## 2. Existing architecture and constraints

- The frontend is a static Vite/React site deployed to GitHub Pages.
- The existing Cloudflare Worker proxies OpenF1 and caches responses in KV.
- No manifest, service-worker registration, or push infrastructure was found.
- The proxy currently permits GET/OPTIONS and uses permissive CORS.
- Session calendars have long cache lifetimes; notification discovery cannot
  assume the public proxy response reflects schedule changes.
- The cache warmer runs hourly around race weekends, so it is not suitable for
  minute-level notification scheduling.
- Confirmed starts and prompt results depend on server-side OpenF1 access.
  Authorization failures must not be interpreted as session events.
- Existing replay toasts are playhead-driven and must remain independent.

## 3. Architecture

```text
Home / Settings
  -> user grants notification permission
  -> browser PushManager creates a subscription
  -> notification API stores subscription and device preferences in D1

Cloudflare Cron Trigger
  -> refresh calendar / inspect relevant session feeds
  -> transactionally record event and pending deliveries in D1
  -> enqueue bounded delivery batches through Cloudflare Queues

Queue consumer
  -> verify current subscription and preferences
  -> send encrypted Web Push with VAPID
  -> record delivery outcome / retry / remove expired subscriptions

Browser push service
  -> root-scoped service worker displays notification
  -> notification click opens the associated session
```

Extend the existing Worker with isolated notification routes and scheduled/queue
handlers. Preserve all existing `/v1` proxy behavior and cache rules. D1 stores
transactional state; existing KV remains the OpenF1 cache.

Use a maintained Web Push library compatible with the deployed Workers runtime.
Verify encryption, VAPID signing, and an actual iPhone delivery in the first
vertical slice before building automated event detection.

## 4. Proposed implementation surfaces

Paths below are proposed; prefer existing helpers when implementation reveals
equivalent functionality.

| Surface | Proposed changes |
| --- | --- |
| Installability | `public/manifest.webmanifest`, app icons, manifest link in `index.html` |
| Service worker | `public/sw.js`: push and notification-click handlers only |
| Browser integration | `src/lib/webPush.ts`, `src/hooks/usePushNotifications.ts` |
| Settings UI | `src/components/SettingsModal/PushNotificationsSettings.tsx` |
| Home instructions | Extend `src/pages/Home.tsx` and its existing tests |
| Preferences | `src/stores/settings.ts`: only portable preference fields, if needed |
| Client tuning | Named notification constants in `src/constants.ts` |
| Worker modules | `proxy/src/notifications/`: routes, validation, storage, discovery, delivery |
| Durable data | Versioned SQL migrations in `proxy/migrations/` |
| Infrastructure | D1, Queue producer/consumer, cron bindings in `proxy/wrangler.toml` |
| Deployment | Extend existing Worker CI/deployment for checks and safe migrations |
| References | `AGENTS.md`, `proxy/README.md`, privacy page, analytics documentation |

Do not intercept frontend fetches, cache app bundles, or implement an offline
shell in this service worker. Existing IndexedDB persistence and stale-chunk
recovery must continue to work unchanged.

## 5. Device API and persistence

### API contract

All notification responses use `Cache-Control: no-store`; errors return explicit
status codes and structured error bodies.

| Method and route | Purpose |
| --- | --- |
| `GET /notifications/config` | Return public VAPID key and feature availability |
| `POST /notifications/subscriptions` | Validate/register a browser subscription; issue a device-management credential |
| `GET /notifications/subscription` | Read current server-side preferences/status using that credential |
| `PATCH /notifications/subscription` | Update preferences using that credential |
| `DELETE /notifications/subscription` | Revoke the device subscription and cancel pending deliveries |
| `POST /notifications/test` | Send a rate-limited test to the authenticated device only |

Registration must be retry-safe for an existing endpoint and must not expose or
replace its management credential without proof of ownership. Choose and test
one recovery mechanism before finalizing registration, such as a browser-created
high-entropy credential whose hash is stored with the endpoint.

Store management credentials only on the current installation, never in URLs,
analytics, settings exports, or notification payloads. Treat push endpoints and
subscription keys as sensitive delivery credentials.

### D1 entities

- `subscriptions`: ID, unique endpoint, encryption keys, credential hash,
  preferences, created/updated/last-seen timestamps, active state.
- `sessions`: latest schedule, normalized session category, source timestamps,
  cancellation state, discovery progress.
- `events`: unique event key, session key, kind, event time, expiry, payload.
- `deliveries`: unique `(event_id, subscription_id)`, state, attempts, next retry,
  lease expiry, last outcome.
- Discovery/fan-out cursors where necessary to resume bounded batches.

Use migrations and database uniqueness constraints, not process-local sets or
eventually consistent KV, for deduplication.

## 6. Frontend behavior

Expose a "Device notifications" section distinct from replay notifications.

1. Detect service-worker, Push API, and notification support using feature checks.
2. On iOS/iPadOS outside the installed app, explain Home Screen installation.
3. Offer an explicit Enable button; never auto-prompt on load.
4. Register the worker and obtain public configuration before the permission
   gesture when possible. Keep permission requesting directly tied to the tap.
5. Subscribe through PushManager and persist the subscription server-side.
6. Show enabled only after backend registration succeeds. If partial setup fails,
   show an explicit retry state and reconcile the existing browser subscription.
7. Support preference updates, test notification, and disable on this device.
8. Reconcile browser permission, PushManager subscription, and server state when
   the installed app opens. Do not rely solely on background subscription-change
   events.

Handle unsupported, install-required, not-requested, denied, enabled, and
backend-error states. Permission denial should show system-settings guidance,
not repeated permission prompts.

Disabling revokes server delivery and unsubscribes locally, surfacing partial
failure instead of falsely reporting complete success.

Keep actual permission/subscription state outside portable settings. Server
preferences are authoritative for delivery; local preference changes must
explicitly synchronize, including settings reset/import if those preferences
are included in portable settings.

## 7. Event detection rules

Use a one-minute cron tick with cheap due-session checks; do not fetch every
feed every minute throughout the year.

- Refresh the calendar periodically, more often near upcoming sessions.
- Use a trusted internal fetch/cache-refresh path with the server OpenF1 token.
  Never expose a public cache-bypass or scheduling endpoint.
- Query race control only around sessions that may have started.
- Query results after completion and retry delayed publication within a bounded
  horizon. Persist discovery state between runs.
- Fetch once per session, never once per subscriber.
- Apply explicit shared rate budgeting, Retry-After handling, and bounded
  concurrency. Independent isolates must not each assume the full API allowance.

### Reminders

- Trigger when the latest scheduled start crosses the 10-minute threshold.
- Proposed catch-up window: two minutes after that threshold; skip older
  reminders rather than sending misleading "in 10 minutes" copy.
- Derive the remaining minutes from the current schedule when sending.
- Recheck cancellation/rescheduling before enqueueing and sending.
- Send at most one reminder per session/device in the first release, even if a
  schedule revision moves the start again.

### Starts

- Require an explicit, fresh session-start message and match actual OpenF1
  fixtures for each session type before enabling it.
- Send once for the overall session, not Q2/Q3, red-flag resumptions, formation
  laps, or standing restarts.
- Proposed event freshness limit: five minutes. Suppress stale events after
  an outage.
- If reliable confirmation is unavailable, skip this alert. A scheduled start
  time is not evidence that the session actually started.

### Results

- Require session-completion evidence plus a non-empty, schema-validated
  classification. Reject incomplete/in-progress data based on verified fixtures.
- Notify once per session. Later result corrections do not create new alerts.
- Proposed publication lookback: 24 hours after completion.
- A new subscription must not receive results for sessions completed before
  registration. An outage must not replay an old season's results.

The proposed timing windows are initial product defaults and must be named
constants with boundary tests. Do not use the frontend's buffered "live" state
as evidence of an actual start or finish.

## 8. Delivery and reliability

- Create event/outbox state transactionally. A crash between database commit and
  Queue enqueue must be recoverable on the next dispatcher pass.
- Fan out with a persisted cursor and bounded batches; never load all
  subscriptions into one invocation.
- Acquire deliveries using atomic leases so duplicate queue messages or
  overlapping cron runs cannot concurrently send the same record.
- Recheck revocation, preference changes, schedule revision, and event expiry
  immediately before sending.
- Set TTL from the event's remaining useful lifetime and a deterministic
  notification tag from its event key.
- Remove expired subscriptions on provider `404`/`410`.
- Back off on transient failures and `429`; honor Retry-After.
- Stop retrying expired events, use a dead-letter queue for exhausted failures,
  and surface VAPID/configuration failures operationally.

A provider may accept a push immediately before the Worker crashes. Retrying
can duplicate delivery; tags reduce visible duplication but do not provide
exactly-once delivery.

Notification payloads contain a version, title, body, event tag, and a validated
same-origin destination. Reuse replay URL builders. A results alert must open an
actual results surface; if a new URL parameter is needed to open the existing
classification dialog, define and test it explicitly.

## 9. Security, privacy, and operations

- Notification-route CORS allows the production frontend and explicit local
  development origins; do not change public proxy CORS behavior.
- CORS is not authentication. Require device credentials for management and
  test actions; apply rate limits and payload-size limits to registration too.
- Validate subscription structure and push-provider destinations. Reject
  private/local addresses and unsafe redirects; do not turn sending into SSRF.
- Choose supported provider validation rules against actual browser-created
  subscriptions and library behavior.
- Keep VAPID private keys and the OpenF1 token in Worker secrets. Only the VAPID
  public key reaches the client. Document key rotation implications.
- Log aggregate counts, latency, throttling, and provider status classes, not
  endpoints, encryption keys, management credentials, or raw request bodies.
- Document purposes, retention, unsubscribing, and relevant processors in the
  privacy policy before rollout.
- Remove provider-expired subscriptions promptly; document a proposed 180-day
  inactive-device retention policy and cleanup job.
- Add operational kill switches for event discovery and sending separately,
  without disabling the existing proxy.

## 10. Phased implementation and acceptance gates

### Phase 1: Installed app -> test push

Build manifest/icons, service worker, D1 migration, VAPID setup, device endpoints,
minimal settings UI, and manual test delivery.

Acceptance:
- Install on an actual iPhone running iOS 16.4+.
- Enable from a direct tap and receive a test while the app is closed.
- Tap the notification and open the expected same-origin destination.
- Denied permission, backend outage, retry, and disable have accurate UI states.
- Existing replay requests and stale-chunk handling remain unaffected.

### Phase 2: Scheduled reminders

Build fresh calendar discovery, session-type normalization, preferences,
transactional outbox, bounded fan-out, Queue consumer, retries, and cleanup.

Acceptance:
- A reminder reaches matching subscribers within the defined scheduling window.
- Repeated cron/queue invocations do not create duplicate database deliveries.
- Cancellation, rescheduling, expired alerts, new subscriptions, opt-out, and
  preference changes behave as specified.

### Phase 3: Confirmed starts and results

Add fixture-backed detectors, bounded live/publication polling, results deep
links, explicit auth-error handling, and stale-event suppression.

Acceptance:
- Practice, qualifying phases, sprints, delayed starts, and red-flag restarts
  are covered by representative tests.
- Empty/in-progress results do not notify; published classifications do.
- Access denial produces operational visibility, not invented start/result
  alerts.

### Phase 4: Production readiness

Add monitoring, retention, privacy copy, deployment automation, documentation,
and end-to-end rollout checks.

Deploy infrastructure/migrations and backend first, then the feature-gated
frontend. Enable test delivery for maintainers before automated sends. Observe
one controlled test session and one real weekend before broad promotion.

## 11. Validation matrix

| Area | Required validation |
| --- | --- |
| Installability | Valid manifest/icons, root scope, stable identity, HTTPS |
| Frontend | Capability/permission states, partial failures, reconciliation, import/reset behavior |
| API | Validation, ownership, idempotent retry, rate limits, no-store responses |
| Discovery | UTC boundaries, schedule revisions, cancellations, year changes, auth/rate limits |
| Detectors | Realistic RC/result fixtures, qualifying phases, restart suppression |
| Delivery | Duplicate messages, crash recovery, leases, expiry, provider failures |
| Navigation | Existing window/new window, exact session, usable results destination |
| Compatibility | Real iPhone/iPad Home Screen app; supported desktop/Android browsers |
| Regression | Existing Worker proxy/cache tests, frontend lint/typecheck and targeted tests |

Use existing Vitest patterns where possible and Workers-compatible integration
tests for D1/Queue behavior. The final gate is real-device delivery, not just
mocking `Notification` or asserting that a push request was sent.

## 12. Deployment prerequisites and remaining decisions

Before provisioning or production activation:

- Confirm Cloudflare D1/Queues availability, usage limits, and expected cost.
- Configure VAPID contact identity and secret management.
- Verify the maintained Web Push library against Workers and Apple endpoints.
- Confirm server-side OpenF1 authorization for starts/results.
- Approve the proposed alert defaults, expiry windows, and retention policy.
- Select the registration ownership/recovery contract and document it in API tests.
- Verify real OpenF1 completion/classification signals before enabling results.

Reference: [WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
