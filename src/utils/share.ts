export function buildShareUrl(options?: {
  currentUrl?: string;
  allowedSearchParams?: string[];
}) {
  const url = new URL(options?.currentUrl ?? window.location.href);

  if (options?.allowedSearchParams) {
    const allowed = new Set(options.allowedSearchParams);
    for (const key of [...url.searchParams.keys()]) {
      if (!allowed.has(key)) url.searchParams.delete(key);
    }
  }

  return url.toString();
}

export async function copyTextToClipboard(text: string) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard API unavailable");
  }

  await navigator.clipboard.writeText(text);
}
