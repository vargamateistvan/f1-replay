import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROUTES_CONFIG_PATH = resolve(process.cwd(), "seo-routes.json");

function isValidRoute(entry) {
  return (
    entry &&
    typeof entry.path === "string" &&
    typeof entry.title === "string" &&
    typeof entry.description === "string" &&
    typeof entry.noindex === "boolean" &&
    typeof entry.changefreq === "string" &&
    typeof entry.priority === "string" &&
    typeof entry.prerender === "boolean"
  );
}

export async function loadSeoRoutes() {
  const raw = await readFile(ROUTES_CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("seo-routes.json must be an array");
  }

  for (const route of parsed) {
    if (!isValidRoute(route)) {
      throw new Error(
        `Invalid route config entry: ${JSON.stringify(route, null, 2)}`,
      );
    }
  }

  return parsed;
}
