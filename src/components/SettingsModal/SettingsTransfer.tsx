import { useRef, useState } from "react";
import { Button } from "@/components/Button/Button";
import { exportSettings, parseSettingsImport, useSettings } from "@/stores/settings";
import { SETTINGS_IMPORT_MAX_BYTES } from "@/constants";

export function SettingsTransfer() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  const download = () => {
    let url: string | undefined;
    try {
      url = URL.createObjectURL(new Blob([exportSettings(useSettings.getState())], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "f1-replay-settings.json";
      link.click();
      setNotice({ error: false, text: "Settings exported." });
    } catch (error) {
      setNotice({ error: true, text: `Export failed: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  };

  const importFile = async (file: File) => {
    setBusy(true);
    setNotice(null);
    try {
      if (file.size > SETTINGS_IMPORT_MAX_BYTES) throw new Error("Settings file is too large (maximum 100 KB).");
      const patch = parseSettingsImport(await file.text());
      useSettings.setState(patch);
      setNotice({ error: false, text: "Settings imported. Changes applied instantly." });
    } catch (error) {
      setNotice({ error: true, text: `Import failed: ${error instanceof Error ? error.message : String(error)} No settings changed.` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0 border-t border-panel pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-small text-muted">Transfer preferences using a JSON file.</span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={download} disabled={busy}>Export settings</Button>
          <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? "Importing…" : "Import settings"}
          </Button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        aria-label="Import settings file"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void importFile(file);
        }}
      />
      {notice && (
        <p role={notice.error ? "alert" : "status"} className={`mt-2 text-small ${notice.error ? "text-red-fg" : "text-green-fg"}`}>
          {notice.text}
        </p>
      )}
    </div>
  );
}
