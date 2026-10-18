/** Browser noise that says nothing about the app: Safari's cross-origin frame / TLS messages. */
export function isCrossOriginFrameError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value);
  return /blocked a frame with origin|cross-origin frame|secure connection to the server cannot be made|certificate for this server is invalid/i.test(
    message,
  );
}

/**
 * True for the opaque "Script error." browsers report when a cross-origin
 * script (analytics, widgets, extensions, content blockers) throws. There is
 * no error object, file or line, so it can't be ours and can't be acted on.
 */
export function isOpaqueScriptError(event: {
  message?: string;
  error?: unknown;
}): boolean {
  if (event.error != null) return false;
  return /^script error\.?$/i.test((event.message ?? "").trim());
}

/** Window `error` events that shouldn't be logged or shown to the user. */
export function isIgnorableWindowError(event: {
  message?: string;
  error?: unknown;
}): boolean {
  return (
    isOpaqueScriptError(event) ||
    isCrossOriginFrameError(event.error ?? event.message ?? "")
  );
}
