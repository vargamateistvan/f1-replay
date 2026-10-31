/**
 * Bakes FORMULA 1 YouTube highlight videos per OpenF1 session into
 * src/data/session-highlights.json ({ [session_key]: SessionHighlight }).
 *
 * Videos come from the channel's uploads, matched by title
 * ("Race Highlights | 2026 United States Grand Prix") with
 * src/utils/highlights.ts:
 *   - default: the long-form uploads RSS feed — no key, but only the ~15
 *     newest videos (about a week), so run it a few times per race weekend;
 *   - YOUTUBE_API_KEY set: pages the uploads playlist through the YouTube Data
 *     API back to --since (default: this year), for backfills (~1 quota unit
 *     per 50 videos).
 * Each new video is checked through oEmbed so deleted or private uploads are
 * skipped. The app links to YouTube rather than embedding: FOM blocks its
 * videos from playing in players on other sites.
 *
 * Existing entries are kept; a session's video is only replaced by a better
 * match (see isPreferredHighlight). Unmatched highlight titles are listed so
 * naming differences can be spotted.
 *
 *   node --use-system-ca scripts/fetch-highlights.mjs [--since 2023]
 *
 * Node ≥ 23.6 — imports a .ts util directly (Node 22: add
 * --experimental-strip-types). Commit the JSON.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  isPreferredHighlight,
  matchHighlightSession,
  parseHighlightTitle,
} from "../src/utils/highlights.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../src/data/session-highlights.json");
const OPENF1 = "https://api.openf1.org/v1";
const OPENF1_FIRST_YEAR = 2023;
const REQUEST_GAP_MS = 2_200;
const CHANNEL_SUFFIX = "B_qr75-ydFVKSF9Dmo6izg"; // FORMULA 1 (UCB_qr75-ydFVKSF9Dmo6izg)
const LONG_FORM_UPLOADS = `UULF${CHANNEL_SUFFIX}`;
const ALL_UPLOADS = `UU${CHANNEL_SUFFIX}`;

let lastRequest = 0;
async function openf1(path) {
  const wait = lastRequest + REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  for (let attempt = 0; attempt < 4; attempt++) {
    lastRequest = Date.now();
    const res = await fetch(`${OPENF1}${path}`);
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 10_000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return res.json();
  }
  throw new Error(`Giving up on ${path}`);
}

const decodeXml = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

async function feedUploads() {
  const res = await fetch(
    `https://www.youtube.com/feeds/videos.xml?playlist_id=${LONG_FORM_UPLOADS}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} for the uploads feed`);
  const xml = await res.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap(([, entry]) => {
    const videoId = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entry)?.[1];
    const title = /<title>([^<]*)<\/title>/.exec(entry)?.[1];
    const publishedAt = /<published>([^<]+)<\/published>/.exec(entry)?.[1];
    return videoId && title && publishedAt
      ? [{ videoId, title: decodeXml(title), publishedAt }]
      : [];
  });
}

async function apiUploads(key, sinceYear) {
  const since = `${sinceYear}-01-01T00:00:00Z`;
  const videos = [];
  let pageToken;
  do {
    const params = new URLSearchParams({
      part: "snippet",
      playlistId: ALL_UPLOADS,
      maxResults: "50",
      key,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
    if (!res.ok) throw new Error(`YouTube API HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const { snippet } of data.items ?? []) {
      videos.push({
        videoId: snippet.resourceId.videoId,
        title: snippet.title,
        publishedAt: snippet.publishedAt,
      });
    }
    pageToken = data.nextPageToken;
    const oldest = data.items?.at(-1)?.snippet.publishedAt;
    if (oldest && oldest < since) break;
  } while (pageToken);
  console.log(`  ${videos.length} uploads since ${sinceYear} from the YouTube API`);
  return videos;
}

/** false when the video is gone (private, deleted). */
async function available(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  );
  // 401/403: embedding disabled, which doesn't matter — the app links out.
  if (res.ok || res.status === 401 || res.status === 403) return true;
  if (res.status === 404 || res.status === 400) return false;
  throw new Error(`oEmbed HTTP ${res.status} for ${videoId}`);
}

function sinceArg() {
  const i = process.argv.indexOf("--since");
  const value = i >= 0 ? Number(process.argv[i + 1]) : new Date().getUTCFullYear();
  if (!Number.isInteger(value)) throw new Error("--since needs a year");
  return Math.max(value, OPENF1_FIRST_YEAR);
}

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const videos = apiKey ? await apiUploads(apiKey, sinceArg()) : await feedUploads();
  const highlights = videos.flatMap((video) => {
    const parsed = parseHighlightTitle(video.title);
    return parsed && parsed.year >= OPENF1_FIRST_YEAR ? [{ video, parsed }] : [];
  });

  const years = [...new Set(highlights.map((h) => h.parsed.year))].sort();
  const meetings = [];
  const sessions = [];
  for (const year of years) {
    meetings.push(...(await openf1(`/meetings?year=${year}`)));
    sessions.push(...(await openf1(`/sessions?year=${year}`)));
  }

  const baked = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const unmatched = [];
  let written = 0;
  for (const { video, parsed } of highlights) {
    const sessionKey = matchHighlightSession(parsed, meetings, sessions);
    if (sessionKey === null) {
      unmatched.push(video.title);
      continue;
    }
    const current = baked[sessionKey];
    if (!isPreferredHighlight(video, current)) continue;
    if (!(await available(video.videoId))) continue;
    baked[sessionKey] = video;
    written++;
    console.log(`  ${sessionKey}: ${video.title} (${video.videoId})`);
  }

  const sorted = Object.fromEntries(
    Object.entries(baked).sort(([a], [b]) => Number(a) - Number(b)),
  );
  writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`);
  for (const title of unmatched) console.warn(`  UNMATCHED ${title}`);
  console.log(
    `\nDone: ${written} written, ${Object.keys(sorted).length} sessions with highlights, ${unmatched.length} unmatched.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
