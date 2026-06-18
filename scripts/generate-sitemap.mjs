import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadSeoRoutes } from "./load-seo-routes.mjs";

const SITE_URL = "https://f1replay.app";

function xmlEscape(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizePath(path) {
  if (!path || path === "/") return "/";
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

function buildSitemapXml(routes) {
  const today = new Date().toISOString().slice(0, 10);
  const urlEntries = routes
    .filter((route) => !route.noindex)
    .map((route) => {
      const normalizedPath = normalizePath(route.path);
      const loc =
        normalizedPath === "/" ? SITE_URL + "/" : SITE_URL + normalizedPath;
      return [
        "  <url>",
        `    <loc>${xmlEscape(loc)}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        `    <changefreq>${route.changefreq}</changefreq>`,
        `    <priority>${route.priority}</priority>`,
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urlEntries,
    "</urlset>",
    "",
  ].join("\n");
}

async function main() {
  const routes = await loadSeoRoutes();
  const outPath = resolve(process.cwd(), "public", "sitemap.xml");
  const xml = buildSitemapXml(routes);
  await writeFile(outPath, xml, "utf8");
  console.log(`Generated sitemap: ${outPath}`);
}

main().catch((error) => {
  console.error("Failed to generate sitemap", error);
  process.exitCode = 1;
});
