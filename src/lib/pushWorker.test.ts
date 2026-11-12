import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(join(cwd(), "public/sw.js"), "utf8");

function setup() {
  const handlers = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const focus = vi.fn().mockResolvedValue(undefined);
  const navigate = vi.fn().mockResolvedValue({ focus });
  const matchAll = vi.fn().mockResolvedValue([{ url: "https://f1replay.app/", navigate }]);
  runInNewContext(source, {
    self: {
      addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler),
      registration: { showNotification }, location: { origin: "https://f1replay.app" },
    },
    clients: { matchAll, openWindow }, URL, console,
  });
  const dispatch = async (type: string, event: object) => {
    let pending: Promise<void> | undefined;
    handlers.get(type)!({ ...event, waitUntil: (promise: Promise<void>) => { pending = promise; } });
    await pending;
  };
  return { handlers, showNotification, openWindow, navigate, focus, matchAll, dispatch };
}

describe("push-only service worker", () => {
  it("ships an installable manifest with correctly sized PNG icons", () => {
    const manifest = JSON.parse(readFileSync(join(cwd(), "public/manifest.webmanifest"), "utf8"));
    expect(manifest).toMatchObject({ id: "/", scope: "/", start_url: "/?view=tracker&ttab=map", display: "standalone" });
    for (const size of [192, 512]) {
      expect(manifest.icons).toContainEqual({
        src: `/app-icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any",
      });
      const png = readFileSync(join(cwd(), `public/app-icon-${size}.png`));
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }
    expect(readFileSync(join(cwd(), "index.html"), "utf8"))
      .toContain('<link rel="manifest" href="/manifest.webmanifest"');
  });

  it("does not intercept fetches or force takeover of existing pages", () => {
    expect([...setup().handlers.keys()]).toEqual(["push", "notificationclick"]);
    expect(source).not.toContain("skipWaiting");
  });

  it("displays a visible notification even for an invalid payload", async () => {
    const worker = setup();
    await worker.dispatch("push", { data: { json: () => ({ unexpected: true }) } });
    expect(worker.showNotification).toHaveBeenCalledWith("F1 Replay", expect.objectContaining({
      body: "Open F1 Replay to see the latest update.",
    }));
  });

  it("displays versioned test pushes and opens an existing window", async () => {
    const worker = setup();
    await worker.dispatch("push", { data: { json: () => ({
      version: 1, title: "Test", body: "Ready", url: "/home", tag: "test",
    }) } });
    expect(worker.showNotification).toHaveBeenCalledWith("Test", expect.objectContaining({ body: "Ready", tag: "test" }));
    await worker.dispatch("notificationclick", { notification: { close: vi.fn(), data: { url: "/home" } } });
    expect(worker.navigate).toHaveBeenCalledWith("https://f1replay.app/home");
    expect(worker.focus).toHaveBeenCalledOnce();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("rejects foreign destinations and opens a new window when necessary", async () => {
    const worker = setup();
    worker.matchAll.mockResolvedValue([]);
    await worker.dispatch("notificationclick", { notification: { close: vi.fn(), data: { url: "https://evil.example/" } } });
    expect(worker.openWindow).toHaveBeenCalledWith("https://f1replay.app/home");
  });

  it("opens a new window if the existing client cannot navigate", async () => {
    const worker = setup();
    worker.navigate.mockResolvedValue(null);
    await worker.dispatch("notificationclick", { notification: { close: vi.fn(), data: { url: "/home" } } });
    expect(worker.openWindow).toHaveBeenCalledWith("https://f1replay.app/home");
  });
});
