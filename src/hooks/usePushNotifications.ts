import { useCallback, useEffect, useRef, useState } from "react";
import {
  applicationServerKey,
  ensurePushCredential,
  loadPushConfig,
  pushRequest,
  pushSupport,
  readPushCredential,
  registerPushWorker,
  removePushCredential,
  type PushConfig,
  type PushSupport,
} from "@/lib/webPush";
import { isPushPreferences, type PushPreferences } from "@/utils/pushPreferences";

type Permission = typeof Notification.permission;

export function usePushNotifications() {
  const [support] = useState<PushSupport>(pushSupport);
  const [permission, setPermission] = useState<Permission>(
    () => "Notification" in window ? Notification.permission : "default",
  );
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [hasCredential, setHasCredential] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<PushPreferences | null>(null);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const running = useRef(false);
  const mounted = useRef(false);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (reason) {
      if (mounted.current) {
        setError(reason instanceof Error ? reason.message : "Device notifications failed. Please retry.");
      }
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  const reconcile = useCallback(() => run(async () => {
    if (support !== "supported") return;
    const nextConfig = await loadPushConfig();
    if (!mounted.current) return;
    setConfig(nextConfig);
    setPermission(Notification.permission);
    // Keep an existing registration manageable even when sending is switched off.
    const worker = nextConfig.enabled
      ? await registerPushWorker()
      : await navigator.serviceWorker.getRegistration("/");
    if (!mounted.current) return;
    registration.current = worker ?? null;
    setReady(Boolean(worker));
    const subscription = await worker?.pushManager.getSubscription();
    if (!mounted.current) return;
    setHasSubscription(Boolean(subscription));
    const credential = readPushCredential();
    setHasCredential(Boolean(credential));
    const server = credential ? await pushRequest("subscription", "GET", credential) : null;
    if (!mounted.current) return;
    const active = Boolean(subscription && Notification.permission === "granted" &&
      server?.enabled === true && server.endpoint === subscription.endpoint);
    setEnabled(active);
    if (active && nextConfig.automaticAlerts && credential) {
      const response = await pushRequest("preferences", "GET", credential);
      if (!isPushPreferences(response.preferences)) throw new Error("Invalid device alert preferences.");
      if (mounted.current) setPreferences(response.preferences);
    } else {
      setPreferences(null);
    }
  }), [run, support]);

  useEffect(() => {
    mounted.current = true;
    void reconcile();
    const onVisible = () => {
      if (document.visibilityState === "visible") void reconcile();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reconcile]);

  const enable = () => {
    void run(async () => {
      const worker = registration.current;
      const publicKey = config?.publicKey;
      if (!config?.enabled || !publicKey || !worker) {
        throw new Error("Notification setup is not ready. Retry setup first.");
      }
      // run invokes this action synchronously: request permission before the first await.
      const granted = await (Notification.permission === "granted"
        ? Promise.resolve<Permission>("granted")
        : Notification.requestPermission());
      if (!mounted.current) return;
      setPermission(granted);
      if (granted !== "granted") throw new Error("Notification permission was not granted. Change it in your device settings to enable notifications.");
      const credential = ensurePushCredential();
      setHasCredential(true);
      let subscription = await worker.pushManager.getSubscription();
      if (!subscription) {
        subscription = await worker.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey),
        });
      }
      if (mounted.current) setHasSubscription(true);
      const saved = await pushRequest("subscriptions", "POST", credential, subscription.toJSON());
      if (saved.enabled !== true) throw new Error("Server did not confirm device registration. Please retry.");
      if (config.automaticAlerts) {
        const response = await pushRequest("preferences", "GET", credential);
        if (!isPushPreferences(response.preferences)) throw new Error("Invalid device alert preferences.");
        if (mounted.current) setPreferences(response.preferences);
      }
      if (mounted.current) {
        setEnabled(true);
        setNotice("Enabled on this device. Send a test to check delivery.");
      }
    });
  };

  const disable = () => void run(async () => {
    const credential = readPushCredential();
    let serverError: unknown;
    if (credential) {
      try {
        const revoked = await pushRequest("subscription", "DELETE", credential);
        if (revoked.enabled !== false) throw new Error("Server did not confirm subscription removal.");
      } catch (reason) {
        serverError = reason;
      }
    }
    if (mounted.current) setEnabled(false);
    const worker = registration.current ?? await navigator.serviceWorker.getRegistration("/");
    const subscription = await worker?.pushManager.getSubscription();
    if (subscription && !await subscription.unsubscribe()) {
      throw new Error(serverError
        ? "Server deletion and browser unsubscribe failed. Please retry."
        : "Server delivery is disabled, but browser unsubscribe failed. Please retry.");
    }
    if (mounted.current) setHasSubscription(false);
    if (serverError) {
      throw new Error("Browser subscription removed, but the server record could not be deleted. Retry to finish disabling this device.");
    }
    removePushCredential();
    if (mounted.current) {
      setHasCredential(false);
      setPreferences(null);
      setNotice("Notifications disabled on this device.");
    }
  });

  const sendTest = () => void run(async () => {
    const credential = readPushCredential();
    if (!credential) throw new Error("Enable device notifications before sending a test.");
    const sent = await pushRequest("test", "POST", credential);
    if (sent.sent !== true) throw new Error("Push service did not confirm the test. Please retry.");
    if (mounted.current) setNotice("Test accepted by the push service. Delivery may be delayed by device settings.");
  });

  const updatePreferences = (next: PushPreferences) => void run(async () => {
    const credential = readPushCredential();
    if (!credential) throw new Error("Enable device notifications before changing alerts.");
    const response = await pushRequest("preferences", "PATCH", credential, next);
    if (!isPushPreferences(response.preferences)) throw new Error("Server did not confirm alert preferences.");
    if (mounted.current) setPreferences(response.preferences);
  });

  return {
    support, permission, config, ready, enabled, hasSubscription, hasCredential, busy, error, notice, preferences,
    enable, disable, sendTest, updatePreferences, retry: reconcile,
  };
}
