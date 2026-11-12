import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { PushNotificationsSettings } from "./PushNotificationsSettings";
import { DEFAULT_PUSH_PREFERENCES } from "@/utils/pushPreferences";

vi.mock("@/hooks/usePushNotifications", () => ({ usePushNotifications: vi.fn() }));

let state: ReturnType<typeof usePushNotifications>;
beforeEach(() => {
  state = {
    support: "supported", permission: "default", config: { enabled: true, publicKey: "key" },
    ready: true, enabled: false, hasSubscription: false, hasCredential: false, busy: false,
    error: null, notice: null, preferences: null, enable: vi.fn(), disable: vi.fn(), sendTest: vi.fn(),
    updatePreferences: vi.fn(),
    retry: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(usePushNotifications).mockImplementation(() => state);
});

describe("device notification settings", () => {
  it("explains installation before asking for permission on iOS", () => {
    state.support = "install-required";
    render(<PushNotificationsSettings />);
    expect(screen.getByText(/open the installed app to enable notifications/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enable device notifications" })).not.toBeInTheDocument();
  });

  it("does not offer unusable controls on unsupported browsers", () => {
    state.support = "unsupported";
    render(<PushNotificationsSettings />);
    expect(screen.getByText(/does not support device push/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps enabling disabled until the server and worker are ready", () => {
    state.config = { enabled: false };
    render(<PushNotificationsSettings />);
    expect(screen.getByText(/not been enabled on the server/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable device notifications" })).toBeDisabled();
  });

  it("explains denied permission without offering another permission request", () => {
    state.permission = "denied";
    render(<PushNotificationsSettings />);
    expect(screen.getByText(/Notifications are blocked/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable device notifications" })).toBeDisabled();
  });

  it("offers enable, test, disable and explicit failure retry actions", () => {
    const { rerender } = render(<PushNotificationsSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Enable device notifications" }));
    expect(state.enable).toHaveBeenCalledOnce();
    state.enabled = true;
    state.hasSubscription = true;
    state.error = "Temporary failure";
    rerender(<PushNotificationsSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Send test notification" }));
    fireEvent.click(screen.getByRole("button", { name: "Disable on this device" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry notification setup" }));
    expect(state.sendTest).toHaveBeenCalledOnce();
    expect(state.disable).toHaveBeenCalledOnce();
    expect(state.retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent("Temporary failure");
    expect(screen.getByText(/Automatic session alerts are not available yet/)).toBeInTheDocument();
  });

  it("shows opt-in alert controls only when the server supports them", () => {
    state.enabled = true;
    state.config = { enabled: true, publicKey: "key", automaticAlerts: true };
    state.preferences = DEFAULT_PUSH_PREFERENCES;
    render(<PushNotificationsSettings />);
    const reminder = screen.getByRole("switch", { name: "Session reminders" });
    expect(reminder).toHaveAttribute("aria-checked", "false");
    fireEvent.click(reminder);
    expect(state.updatePreferences).toHaveBeenCalledWith({
      ...DEFAULT_PUSH_PREFERENCES,
      alerts: { ...DEFAULT_PUSH_PREFERENCES.alerts, reminder: true },
    });
  });
});
