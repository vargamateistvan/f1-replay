import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { exportSettings, useSettings } from "@/stores/settings";
import { SETTINGS_IMPORT_MAX_BYTES } from "@/constants";
import { SettingsTransfer } from "./SettingsTransfer";

beforeEach(() => {
  useSettings.getState().reset();
  useSettings.getState().openModal("general");
});

function upload(text: string) {
  const file = new File([text], "settings.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(text) });
  fireEvent.change(screen.getByLabelText("Import settings file"), { target: { files: [file] } });
}

describe("SettingsTransfer", () => {
  it("downloads an export and revokes the object URL", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    render(<SettingsTransfer />);
    fireEvent.click(screen.getByRole("button", { name: "Export settings" }));
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:test-url");
    expect(screen.getByRole("status")).toHaveTextContent("Settings exported");
    click.mockRestore();
    revoke.mockRestore();
  });

  it("imports preferences while keeping the settings dialog and onboarding state", async () => {
    const text = exportSettings({ ...useSettings.getState(), lightMode: true, defaultSpeed: 8 });
    useSettings.setState({ tourSeenVersion: 5, replayWelcomeSeen: true });
    render(<SettingsTransfer />);
    upload(text);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Settings imported"));
    expect(useSettings.getState().lightMode).toBe(true);
    expect(useSettings.getState().defaultSpeed).toBe(8);
    expect(useSettings.getState().isOpen).toBe(true);
    expect(useSettings.getState().tourSeenVersion).toBe(5);
    expect(useSettings.getState().replayWelcomeSeen).toBe(true);
    expect(JSON.parse(localStorage.getItem("f1-replay-settings")!).state.defaultSpeed).toBe(8);
  });

  it("rejects the whole import when even one value is invalid", async () => {
    const before = useSettings.getState();
    render(<SettingsTransfer />);
    upload(JSON.stringify({ format: "f1-replay-settings", version: 1, settings: { lightMode: true, defaultSpeed: 3 } }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No settings changed"));
    expect(useSettings.getState()).toBe(before);
  });

  it("shows file-reading errors and rejects oversized files", async () => {
    render(<SettingsTransfer />);
    const file = new File([], "settings.json");
    Object.defineProperty(file, "text", { value: () => Promise.reject(new Error("Cannot read file")) });
    fireEvent.change(screen.getByLabelText("Import settings file"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Cannot read file"));
    const large = new File([" ".repeat(SETTINGS_IMPORT_MAX_BYTES + 1)], "large.json");
    fireEvent.change(screen.getByLabelText("Import settings file"), { target: { files: [large] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("too large"));
  });
});
