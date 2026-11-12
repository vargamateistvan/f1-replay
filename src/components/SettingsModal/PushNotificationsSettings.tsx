import { usePushNotifications } from "@/hooks/usePushNotifications";
import { SectionHeader, SettingRow } from "@/components/UI";
import { buttonClass } from "@/components/Button/buttonClass";
import type { PushAlertType, PushSessionType } from "@/utils/pushPreferences";

const ALERTS: { key: PushAlertType; label: string; description: string }[] = [
  { key: "reminder", label: "Session reminders", description: "About 10 minutes before the scheduled start" },
  { key: "started", label: "Session starts", description: "When a session start is confirmed" },
  { key: "results", label: "Results available", description: "When a classification is published" },
];
const SESSIONS: { key: PushSessionType; label: string }[] = [
  { key: "race", label: "Race" }, { key: "sprint", label: "Sprint" },
  { key: "qualifying", label: "Qualifying" }, { key: "sprintQualifying", label: "Sprint qualifying" },
  { key: "practice", label: "Practice" },
];

export function PushNotificationsSettings() {
  const push = usePushNotifications();
  const preferences = push.preferences;
  return (
    <section aria-label="Device notifications">
      <SectionHeader>Device notifications</SectionHeader>
      <p className="mb-3 text-small leading-5 text-muted">
        Receive notifications even when the app is closed. These controls affect
        only this device, not replay toasts or settings exports.
      </p>
      {push.support === "install-required" ? (
        <p className="text-body leading-6 text-fg">
          On iPhone or iPad (iOS/iPadOS 16.4+), open F1 Replay in Safari, tap Share,
          choose Add to Home Screen, then open the installed app to enable notifications.
        </p>
      ) : push.support === "unsupported" ? (
        <p className="text-body text-muted">This browser does not support device push notifications.</p>
      ) : (
        <>
          {push.permission === "denied" && (
            <p className="mb-3 text-body text-muted">
              Notifications are blocked. Allow them for F1 Replay in your device or browser settings.
            </p>
          )}
          {push.config?.enabled === false && (
            <p className="mb-3 text-body text-muted">
              Device notifications have not been enabled on the server yet.
            </p>
          )}
          {push.enabled && <p className="mb-3 text-body text-green-fg">Enabled on this device.</p>}
          {push.enabled && !push.config?.automaticAlerts && (
            <p className="mb-3 text-small text-muted">Automatic session alerts are not available yet.</p>
          )}
          {push.enabled && push.config?.automaticAlerts && preferences && (
            <>
              <p className="mt-4 text-small text-muted">
                Alerts are optional and may be delayed or unavailable when session data is unavailable.
              </p>
              {ALERTS.map(({ key, label, description }) => (
                <SettingRow key={key} label={label} description={description}
                  checked={preferences.alerts[key]} disabled={push.busy}
                  onChange={(value) => push.updatePreferences({
                    ...preferences, alerts: { ...preferences.alerts, [key]: value },
                  })} />
              ))}
              <SectionHeader>Session types</SectionHeader>
              {SESSIONS.map(({ key, label }) => (
                <SettingRow key={key} label={label} checked={preferences.sessions[key]}
                  disabled={push.busy}
                  onChange={(value) => push.updatePreferences({
                    ...preferences, sessions: { ...preferences.sessions, [key]: value },
                  })} />
              ))}
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {!push.enabled && (
              <button type="button" className={buttonClass("primary", "sm")}
                disabled={push.busy || !push.ready || !push.config?.enabled || push.permission === "denied"}
                onClick={push.enable}>
                Enable device notifications
              </button>
            )}
            {push.enabled && push.config?.enabled && (
              <button type="button" className={buttonClass("secondary", "sm")}
                disabled={push.busy} onClick={push.sendTest}>
                Send test notification
              </button>
            )}
            {(push.enabled || push.hasSubscription || push.hasCredential) && (
              <button type="button" className={buttonClass("secondary", "sm")}
                disabled={push.busy} onClick={push.disable}>
                Disable on this device
              </button>
            )}
          </div>
          {push.busy && <p role="status" className="mt-3 text-small text-muted">Updating device notifications…</p>}
          {push.error && (
            <div className="mt-3">
              <p role="alert" className="text-small text-red-fg">{push.error}</p>
              <button type="button" className={buttonClass("secondary", "sm", "mt-2")}
                disabled={push.busy} onClick={() => void push.retry()}>
                Retry notification setup
              </button>
            </div>
          )}
          {push.notice && <p role="status" className="mt-3 text-small text-fg">{push.notice}</p>}
        </>
      )}
    </section>
  );
}
