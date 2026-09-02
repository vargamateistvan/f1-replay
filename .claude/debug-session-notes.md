Symptom: pressing Play made the app look like it was vibrating / reloading every ~2s.

Confirmed behavior:
- Playback was actually running.
- The URL playhead (`t`) was being rewritten on a 2s cadence by `useTimelineUrlSync`.
- The browser never did a full navigation; it was a history replace / URL churn problem.

Repro:
- Open the main replay page.
- Start playback.
- Watch the URL/query updates and the page feel "refreshy" every few seconds.

Fix direction:
- Keep the URL stable while playback is running.
- Only persist playhead state when paused/stopped, plus manual speed changes.
