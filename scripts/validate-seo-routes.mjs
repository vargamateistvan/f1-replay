import { loadSeoRoutes } from "./load-seo-routes.mjs";

const VALID_CHANGEFREQ = new Set([
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
]);

function normalizePath(path) {
  if (!path || path === "/") return "/";
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

function validateRoute(route, index, seenPaths, errors) {
  const prefix = `Route #${index + 1} (${route.path})`;

  if (!route.title.trim()) {
    errors.push(`${prefix}: title must be non-empty`);
  }

  if (!route.description.trim()) {
    errors.push(`${prefix}: description must be non-empty`);
  }

  if (!route.path.startsWith("/")) {
    errors.push(`${prefix}: path must start with '/'`);
  }

  if (route.path.length > 1 && route.path.endsWith("/")) {
    errors.push(`${prefix}: path must not have a trailing slash`);
  }

  if (/\s/.test(route.path)) {
    errors.push(`${prefix}: path must not contain whitespace`);
  }

  const normalizedPath = normalizePath(route.path);
  if (seenPaths.has(normalizedPath)) {
    errors.push(`${prefix}: duplicate path '${normalizedPath}'`);
  } else {
    seenPaths.add(normalizedPath);
  }

  if (!VALID_CHANGEFREQ.has(route.changefreq)) {
    errors.push(
      `${prefix}: changefreq must be one of ${Array.from(VALID_CHANGEFREQ).join(", ")}`,
    );
  }

  const priorityNumber = Number(route.priority);
  if (
    Number.isNaN(priorityNumber) ||
    priorityNumber < 0 ||
    priorityNumber > 1
  ) {
    errors.push(
      `${prefix}: priority must be a number string between 0.0 and 1.0`,
    );
  }

  if (!/^\d\.\d$/.test(route.priority)) {
    errors.push(`${prefix}: priority should use one decimal place (e.g. 0.8)`);
  }

  if (route.noindex && route.prerender) {
    errors.push(`${prefix}: noindex routes cannot be prerendered`);
  }
}

async function main() {
  const routes = await loadSeoRoutes();
  const errors = [];
  const seenPaths = new Set();

  routes.forEach((route, index) => {
    validateRoute(route, index, seenPaths, errors);
  });

  const homeRoute = routes.find((route) => normalizePath(route.path) === "/");
  if (!homeRoute) {
    errors.push("Missing required root route '/' in seo-routes.json");
  }

  if (homeRoute?.noindex) {
    errors.push("Root route '/' must be indexable (noindex: false)");
  }

  if (errors.length > 0) {
    console.error("SEO route validation failed:\n");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`SEO route validation passed (${routes.length} routes checked).`);
}

main().catch((error) => {
  console.error("Failed to validate seo-routes.json", error);
  process.exitCode = 1;
});
