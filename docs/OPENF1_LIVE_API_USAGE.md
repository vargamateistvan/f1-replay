# OpenF1 Live API Usage

This project uses the OpenF1 API as its live and historical data source.
This guide shows how to query it directly and how those requests map to the
existing API layer in this repo.

## Access Model

- Base URL: `https://api.openf1.org/v1`
- Historical data from 2023 onward is available without authentication.
- Real-time access requires an OpenF1 paid subscription.
- Responses are JSON by default.
- CSV export is available by appending `csv=true` to a request.

## Live Usage Notes

For live or current weekend data, prefer `latest` when an endpoint accepts
`meeting_key` or `session_key`.

Examples:

```text
https://api.openf1.org/v1/meetings?meeting_key=latest
https://api.openf1.org/v1/sessions?session_key=latest
https://api.openf1.org/v1/race_control?session_key=latest
https://api.openf1.org/v1/weather?session_key=latest
```

For this app, the most useful live endpoints are:

- `meetings`
- `sessions`
- `drivers`
- `race_control`
- `weather`
- `position`
- `intervals`
- `laps`
- `location`
- `car_data`
- `stints`
- `pit`
- `team_radio`
- `session_result`
- `starting_grid`
- `overtakes`
- `championship_drivers`
- `championship_teams`

## Direct Request Examples

### 1. Find the current meeting

```bash
curl "https://api.openf1.org/v1/meetings?meeting_key=latest"
```

### 2. Find the current session

```bash
curl "https://api.openf1.org/v1/sessions?session_key=latest"
```

### 3. Get live race control messages

```bash
curl "https://api.openf1.org/v1/race_control?session_key=latest"
```

### 4. Get live weather data

```bash
curl "https://api.openf1.org/v1/weather?session_key=latest"
```

### 5. Get live position changes

```bash
curl "https://api.openf1.org/v1/position?session_key=latest"
```

### 6. Get live driver intervals

```bash
curl "https://api.openf1.org/v1/intervals?session_key=latest"
```

### 7. Get driver telemetry for a specific driver

```bash
curl "https://api.openf1.org/v1/car_data?session_key=latest&driver_number=1"
```

### 8. Get location samples for all drivers

```bash
curl "https://api.openf1.org/v1/location?session_key=latest"
```

## Filtering

OpenF1 supports attribute-based filtering directly in the query string. This is
important for keeping live requests small enough for the UI.

Examples:

```bash
curl "https://api.openf1.org/v1/race_control?session_key=latest&category=Flag"
curl "https://api.openf1.org/v1/position?session_key=latest&position<=3"
curl "https://api.openf1.org/v1/laps?session_key=latest&driver_number=81&lap_number=10"
curl "https://api.openf1.org/v1/team_radio?session_key=latest&driver_number=16"
```

Time windows are especially useful for live replay and telemetry panels:

```bash
curl "https://api.openf1.org/v1/location?session_key=latest&date>=2026-06-18T12:00:00Z&date<2026-06-18T12:00:10Z"
curl "https://api.openf1.org/v1/car_data?session_key=latest&driver_number=4&date>=2026-06-18T12:00:00Z&date<2026-06-18T12:00:10Z"
```

## CSV Export

Append `csv=true` when you want to download or inspect the data in spreadsheet
tools.

```bash
curl "https://api.openf1.org/v1/weather?session_key=latest&csv=true"
curl "https://api.openf1.org/v1/race_control?session_key=latest&category=Flag&csv=true"
```

## Project Integration

The repo already wraps OpenF1 in the API layer:

- [src/api/client.ts](/Users/mavarga/Documents/f1-replay/src/api/client.ts)
- [src/api/endpoints.ts](/Users/mavarga/Documents/f1-replay/src/api/endpoints.ts)

Important implementation details:

- Requests go to `https://api.openf1.org/v1`.
- The client preserves comparison operators in query keys such as `date>`,
  `date<`, `position<=`, and `speed>=`.
- The client rate-limits requests to avoid OpenF1 free-tier `429` responses.
- Empty OpenF1 `404` responses are treated as empty datasets when appropriate.
- If needed, the app can send `VITE_OPENF1_API_KEY` as a bearer token.

## App-Level Examples

These examples match how this codebase already works.

### Fetch the latest race control feed

```ts
import { fetchEndpoint } from "@/api/client";

const items = await fetchEndpoint("race_control", {
  session_key: "latest",
});
```

### Fetch a live telemetry slice for one driver

```ts
import { fetchEndpoint } from "@/api/client";

const samples = await fetchEndpoint("car_data", {
  session_key: "latest",
  driver_number: 1,
  "date>": "2026-06-18T12:00:00Z",
  "date<": "2026-06-18T12:00:10Z",
});
```

### Fetch live position data through the repo API wrapper

```ts
import { api } from "@/api/endpoints";

const leaders = await api.positions("latest" as never, {
  "position<=": 3,
});
```

Note: today, most endpoint wrappers in [src/api/endpoints.ts](/Users/mavarga/Documents/f1-replay/src/api/endpoints.ts) are typed with numeric `sessionKey` or `meetingKey` parameters. OpenF1 itself accepts `latest`, so if you want first-class live support in the app code, the next step is to widen those wrapper parameter types from `number` to `number | "latest"` where appropriate.

## Recommended Live Flow For This Repo

1. Resolve the active session with `sessions?session_key=latest`.
2. Load driver metadata with `drivers?session_key=latest`.
3. Poll lightweight endpoints first:
   - `race_control`
   - `weather`
   - `position`
   - `intervals`
4. Load heavier telemetry endpoints in narrow time windows:
   - `location`
   - `car_data`
5. Use filtered queries to avoid pulling full-session payloads during playback.

## Caveats

- Team radio coverage is sparse for many 2026 sessions.
- `championship_drivers` and `championship_teams` are race-only beta endpoints.
- Some endpoints are only meaningful during race sessions, such as `intervals`
  and `overtakes`.
- OpenF1 may return `404` for valid filters when no data exists in the selected
  window.

## Reference

- Official docs: `https://openf1.org/docs/#api-endpoints`
- Live streaming/auth info: `https://openf1.org/auth.html`
