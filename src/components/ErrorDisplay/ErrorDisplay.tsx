import { useEffect, useState } from "react";

function isCrossOriginFrameError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value);
  return /blocked a frame with origin|cross-origin frame|secure connection to the server cannot be made|certificate for this server is invalid/i.test(
    message,
  );
}

export function ErrorDisplay() {
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    // Load persisted errors from sessionStorage
    try {
      const stored = sessionStorage.getItem("__app_errors");
      if (stored) {
        const parsed = JSON.parse(stored);
        setErrors(parsed.map((e: { msg?: string }) => e.msg || String(e)));
      }
    } catch (e) {
      console.error("Failed to load stored errors:", e);
    }

    // Listen for new errors
    const handleError = (event: ErrorEvent) => {
      if (isCrossOriginFrameError(event.error ?? event.message)) {
        event.preventDefault();
        return;
      }
      const msg = `${event.error?.message || event.message}`;
      setErrors((prev) => [...prev.slice(-9), msg]);
      event.preventDefault();
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      if (isCrossOriginFrameError(event.reason)) {
        event.preventDefault();
        return;
      }
      const msg = `Promise: ${event.reason?.message || event.reason}`;
      setErrors((prev) => [...prev.slice(-9), msg]);
      event.preventDefault();
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  if (errors.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-f1red/90 border-t border-f1red text-white p-3 text-xs font-mono z-50 max-h-32 overflow-y-auto">
      <div className="font-bold mb-2 flex justify-between">
        <span>Debug: {errors.length} Error(s)</span>
        <button
          onClick={() => {
            setErrors([]);
            try {
              sessionStorage.removeItem("__app_errors");
            } catch {
              // Ignore errors when clearing storage
            }
          }}
          className="text-white/70 hover:text-white"
        >
          ✕
        </button>
      </div>
      {errors.map((err, i) => (
        <div key={i} className="truncate text-white/80">
          {i + 1}. {err}
        </div>
      ))}
    </div>
  );
}
