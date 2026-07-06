import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadSeoRoutes } from "./load-seo-routes.mjs";

const SITE_URL = "https://f1replay.app";
const DEFAULT_IMAGE_ALT =
  "F1 Replay app preview showing telemetry, strategy, and live timing";
const SITE_NAME = "F1 Replay";
const DIST_DIR = resolve(process.cwd(), "dist");
const INDEX_HTML_PATH = resolve(DIST_DIR, "index.html");

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

function setAlternateHreflang(html, hreflang, href) {
  const escapedLang = escapeRegExp(hreflang);
  const re = new RegExp(
    `<link\\s+rel=[\"']alternate[\"']\\s+hreflang=[\"']${escapedLang}[\"']\\s+href=[\"'][^\"']*[\"']\\s*\\/>`,
    "i",
  );
  const nextTag = `<link rel=\"alternate\" hreflang=\"${hreflang}\" href=\"${href}\" />`;
  if (re.test(html)) return html.replace(re, nextTag);
  return html.replace("</head>", `  ${nextTag}\n</head>`);
}

function setTitle(html, title) {
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  }
  return html.replace("</head>", `  <title>${title}</title>\n</head>`);
}

function collectBreadcrumbs(routePath, routes) {
  const normalized = routePath === "/" ? "/" : routePath.replace(/\/$/, "");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  const crumbs = [{ name: "Home", url: `${SITE_URL}/` }];
  let current = "";
  for (const segment of segments) {
    current += `/${segment}`;
    const match = routes.find((route) => route.path === current);
    if (!match) continue;
    crumbs.push({ name: match.title, url: `${SITE_URL}${match.path}` });
  }

  return crumbs;
}

function buildRouteSchemas(route, routes) {
  const canonical = `${SITE_URL}${route.path}`;
  const schemas = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: route.title,
      description: route.description,
      url: canonical,
      inLanguage: "en",
      isPartOf: {
        "@type": "WebSite",
        name: SITE_NAME,
        url: `${SITE_URL}/`,
      },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: `${SITE_URL}/og-cover.svg`,
      },
    },
  ];

  const breadcrumbs = collectBreadcrumbs(route.path, routes);
  if (breadcrumbs.length > 1) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((crumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
        item: crumb.url,
      })),
    });
  }

  if (route.path === "/") {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "SportsApplication",
      operatingSystem: "Web",
      url: `${SITE_URL}/`,
      description: route.description,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    });
  }

  return schemas;
}

function setWebPageJsonLd(html, route, routes) {
  const jsonLd = buildRouteSchemas(route, routes);

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

function renderRouteShell(indexHtml, route, routes) {
  const canonical = `${SITE_URL}${route.path}`;
  let html = indexHtml;

  html = setTitle(html, route.title);
  html = setMetaByName(html, "description", route.description);
  html = setMetaByName(html, "application-name", SITE_NAME);
  html = setMetaByName(html, "apple-mobile-web-app-title", SITE_NAME);
  html = setMetaByName(html, "format-detection", "telephone=no");
  if (route.keywords) {
    html = setMetaByName(html, "keywords", route.keywords);
  }
  html = setMetaByName(html, "robots", route.robots);
  html = setMetaByName(html, "twitter:title", route.title);
  html = setMetaByName(html, "twitter:description", route.description);
  html = setMetaByName(html, "twitter:image:alt", DEFAULT_IMAGE_ALT);
  html = setMetaByProperty(html, "og:title", route.title);
  html = setMetaByProperty(html, "og:description", route.description);
  html = setMetaByProperty(html, "og:url", canonical);
  html = setMetaByProperty(html, "og:locale", "en_US");
  html = setMetaByProperty(html, "og:image:width", "1200");
  html = setMetaByProperty(html, "og:image:height", "630");
  html = setMetaByProperty(html, "og:image:alt", DEFAULT_IMAGE_ALT);
  html = setCanonical(html, canonical);
  html = setAlternateHreflang(html, "en", canonical);
  html = setAlternateHreflang(html, "x-default", canonical);
  html = setWebPageJsonLd(html, route, routes);

  return html;
}

async function main() {
  const routes = await loadSeoRoutes();
  const indexHtml = await readFile(INDEX_HTML_PATH, "utf8");
  const routeShells = routes.filter(
    (route) => route.prerender && !route.noindex,
  );

  for (const route of routeShells) {
    const dirName = route.path.replace(/^\//, "");
    const outDir = resolve(DIST_DIR, dirName);
    const outFile = resolve(outDir, "index.html");
    const html = renderRouteShell(
      indexHtml,
      {
        ...route,
        robots: "index, follow",
      },
      routes,
    );
    await mkdir(outDir, { recursive: true });
    await writeFile(outFile, html, "utf8");
    console.log(`Generated route shell: ${outFile}`);
  }
}

main().catch((error) => {
  console.error("Failed to generate route shells", error);
  process.exitCode = 1;
});
