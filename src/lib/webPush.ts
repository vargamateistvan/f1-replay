import {
  PUSH_API_BASE,
  PUSH_CREDENTIAL_BYTES,
  PUSH_CREDENTIAL_STORAGE_KEY,
  PUSH_REQUEST_TIMEOUT_MS,
} from "@/constants";

export type PushSupport = "supported" | "install-required" | "unsupported";
export interface PushConfig {
  enabled: boolean;
  publicKey?: string;
}

export class PushApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "PushApiError";
  }
}

export function pushSupport(): PushSupport {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true);
  if (ios && !standalone) return "install-required";
  return window.isSecureContext && "serviceWorker" in navigator &&
    "PushManager" in window && "Notification" in window ? "supported" : "unsupported";
}

export function readPushCredential(): string | null {
  return localStorage.getItem(PUSH_CREDENTIAL_STORAGE_KEY);
}

export function ensurePushCredential(): string {
  const existing = readPushCredential();
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(PUSH_CREDENTIAL_BYTES));
  const credential = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  localStorage.setItem(PUSH_CREDENTIAL_STORAGE_KEY, credential);
  return credential;
}

export function removePushCredential(): void {
  localStorage.removeItem(PUSH_CREDENTIAL_STORAGE_KEY);
}

export function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const key = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  if (key.length !== 65 || key[0] !== 4) throw new Error("Invalid notification server public key.");
  return key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function pushRequest(
  path: string, method = "GET", credential?: string | null, body?: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${PUSH_API_BASE.replace(/\/$/, "")}/notifications/${path}`, {
    method,
    cache: "no-store",
    credentials: "omit",
    headers: {
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(PUSH_REQUEST_TIMEOUT_MS),
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new PushApiError(response.status, "Notification server returned an invalid response. Please retry.");
  }
  if (!response.ok) {
    throw new PushApiError(response.status,
      isRecord(data) && typeof data.error === "string" ? data.error : "Notification request failed.");
  }
  if (!isRecord(data)) throw new Error("Invalid notification server response.");
  return data;
}

export async function loadPushConfig(): Promise<PushConfig> {
  const data = await pushRequest("config");
  if (data.enabled === false) return { enabled: false };
  if (data.enabled !== true || typeof data.publicKey !== "string") {
    throw new Error("Invalid notification server configuration.");
  }
  applicationServerKey(data.publicKey);
  return { enabled: true, publicKey: data.publicKey };
}

export async function registerPushWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Notification worker did not become ready. Please retry.")),
          PUSH_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
