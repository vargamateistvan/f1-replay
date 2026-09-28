import { useEffect, useState } from "react";
import { LATEST_RELEASE_API_URL } from "@/lib/appVersion";

type ReleaseResponse = { published_at?: string; created_at?: string };

// Shared across every consumer so the footer and mobile About dialog issue a
// single GitHub request per page load.
let publishedAtPromise: Promise<string | null> | null = null;

function fetchLatestReleasePublishedAt(): Promise<string | null> {
  if (typeof fetch !== "function") return Promise.resolve(null);
  publishedAtPromise ??= fetch(LATEST_RELEASE_API_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`GitHub releases request failed: ${response.status}`);
      }
      return response.json() as Promise<ReleaseResponse>;
    })
    .then((data) => data.published_at ?? data.created_at ?? null)
    .catch(() => {
      // Allow a later mount to retry after a transient failure.
      publishedAtPromise = null;
      return null;
    });
  return publishedAtPromise;
}

export function resetReleaseDateCache() {
  publishedAtPromise = null;
}

/** ISO timestamp of the latest GitHub release, or null while loading/unavailable. */
export function useReleaseDate(): string | null {
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    void fetchLatestReleasePublishedAt().then((value) => {
      if (isMounted) setPublishedAt(value);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return publishedAt;
}
