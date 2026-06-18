import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SITE_URL = "https://f1replay.app";
const DEFAULT_IMAGE_ALT =
  "F1 Replay app preview showing telemetry, strategy, and live timing";
const DIST_DIR = resolve(process.cwd(), "dist");
const INDEX_HTML_PATH = resolve(DIST_DIR, "index.html");

const ROUTE_SHELLS = [
  {
    path: "/telemetry",
    title: "F1 Telemetry Comparison | Lap-by-Lap Driver Analysis",
    description:
      "Compare Formula 1 driver laps with synchronized speed, throttle, brake, gear, and RPM traces to uncover where lap time is won or lost.",
    keywords:
      "F1 telemetry comparison, Formula 1 lap analysis, speed trace, throttle trace",
    robots: "index, follow",
  },
  {
    path: "/standings",
    title: "F1 Standings Dashboard | Driver & Constructor Points",
    description:
      "Explore Formula 1 championship standings with interactive driver and constructor points views, wins, and podium trends.",
    keywords: "F1 standings, Formula 1 driver standings, constructor standings",
    robots: "index, follow",
  },
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setMetaByName(html, name, value) {
  const escapedName = escapeRegExp(name);
  const re = new RegExp(
    `<meta\\s+name=[\"']${escapedName}[\"']\\s+content=[\"'][^\"']*[\"']\\s*\\/>`,
    "i",
  );
  const nextTag = `<meta name=\"${name}\" content=\"${value}\" />`;
  if (re.test(html)) return html.replace(re, nextTag);
  return html.replace("</head>", `  ${nextTag}\n</head>`);
}

function setMetaByProperty(html, property, value) {
  const escapedProperty = escapeRegExp(property);
  const re = new RegExp(
    `<meta\\s+property=[\"']${escapedProperty}[\"']\\s+content=[\"'][^\"']*[\"']\\s*\\/>`,
    "i",
  );
  const nextTag = `<meta property=\"${property}\" content=\"${value}\" />`;
  if (re.test(html)) return html.replace(re, nextTag);
  return html.replace("</head>", `  ${nextTag}\n</head>`);
}

function setCanonical(html, href) {
  const re = /<link\s+rel=[\"']canonical[\"']\s+href=[\"'][^\"']*[\"']\s*\/>/i;
  const nextTag = `<link rel=\"canonical\" href=\"${href}\" />`;
  if (re.test(html)) return html.replace(re, nextTag);
  return html.replace("</head>", `  ${nextTag}\n</head>`);
}

function setTitle(html, title) {
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  }
  return html.replace("</head>", `  <title>${title}</title>\n</head>`);
}

function setWebPageJsonLd(html, routePath, title, description) {
  const url = `${SITE_URL}${routePath}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url,
    isPartOf: {
      "@type": "WebSite",
      name: "F1 Replay",
      url: `${SITE_URL}/`,
    },
  };

  const scriptTag = `  <script id=\"prerender-route-jsonld\" type=\"application/ld+json\">${JSON.stringify(jsonLd)}</script>`;
  if (
    /<script\s+id=[\"']prerender-route-jsonld[\"'][\s\S]*?<\/script>/i.test(
      html,
    )
  ) {
    return html.replace(
      /<script\s+id=[\"']prerender-route-jsonld[\"'][\s\S]*?<\/script>/i,
      scriptTag,
    );
  }
  return html.replace("</head>", `${scriptTag}\n</head>`);
}

function renderRouteShell(indexHtml, route) {
  const canonical = `${SITE_URL}${route.path}`;
  let html = indexHtml;

  html = setTitle(html, route.title);
  html = setMetaByName(html, "description", route.description);
  html = setMetaByName(html, "keywords", route.keywords);
  html = setMetaByName(html, "robots", route.robots);
  html = setMetaByName(html, "twitter:title", route.title);
  html = setMetaByName(html, "twitter:description", route.description);
  html = setMetaByName(html, "twitter:image:alt", DEFAULT_IMAGE_ALT);
  html = setMetaByProperty(html, "og:title", route.title);
  html = setMetaByProperty(html, "og:description", route.description);
  html = setMetaByProperty(html, "og:url", canonical);
  html = setMetaByProperty(html, "og:image:alt", DEFAULT_IMAGE_ALT);
  html = setCanonical(html, canonical);
  html = setWebPageJsonLd(html, route.path, route.title, route.description);

  return html;
}

async function main() {
  const indexHtml = await readFile(INDEX_HTML_PATH, "utf8");

  for (const route of ROUTE_SHELLS) {
    const dirName = route.path.replace(/^\//, "");
    const outDir = resolve(DIST_DIR, dirName);
    const outFile = resolve(outDir, "index.html");
    const html = renderRouteShell(indexHtml, route);
    await mkdir(outDir, { recursive: true });
    await writeFile(outFile, html, "utf8");
    console.log(`Generated route shell: ${outFile}`);
  }
}

main().catch((error) => {
  console.error("Failed to generate route shells", error);
  process.exitCode = 1;
});
