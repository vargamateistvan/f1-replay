import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import routeEntries from "../../../seo-routes.json";

const SITE_NAME = "F1 Replay";
const SITE_URL = "https://f1replay.app";
const DEFAULT_IMAGE_URL = `${SITE_URL}/og-cover.svg`;
const DEFAULT_IMAGE_ALT =
  "F1 Replay app preview showing telemetry, strategy, and live timing";

type RouteDefinition = {
  path: string;
  title: string;
  description: string;
  keywords?: string;
  noindex: boolean;
  changefreq: string;
  priority: string;
  prerender: boolean;
};

const ROUTES: Record<string, RouteDefinition> = Object.fromEntries(
  (routeEntries as RouteDefinition[]).map((route) => [
    normalizePath(route.path),
    route,
  ]),
);

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function upsertMetaByName(name: string, content: string) {
  let node = document.head.querySelector<HTMLMetaElement>(
    `meta[name=\"${name}\"]`,
  );
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute("name", name);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
}

function upsertMetaByProperty(property: string, content: string) {
  let node = document.head.querySelector<HTMLMetaElement>(
    `meta[property=\"${property}\"]`,
  );
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute("property", property);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let node = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!node) {
    node = document.createElement("link");
    node.setAttribute("rel", "canonical");
    document.head.appendChild(node);
  }
  node.setAttribute("href", href);
}

function upsertJsonLd(jsonLd: Record<string, unknown>) {
  const id = "route-seo-jsonld";
  let node = document.getElementById(id) as HTMLScriptElement | null;
  if (!node) {
    node = document.createElement("script");
    node.id = id;
    node.type = "application/ld+json";
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(jsonLd);
}

export function RouteSeo() {
  const location = useLocation();

  useEffect(() => {
    const pathname = normalizePath(location.pathname || "/");
    const route = ROUTES[pathname] ?? {
      title: "F1 Replay | Formula 1 Data Replay Platform",
      description:
        "Interactive Formula 1 replay platform with telemetry, strategy analysis, race control, and live timing visualizations.",
      path: pathname,
      noindex: true,
    };

    const canonicalUrl = `${SITE_URL}${route.path}`;
    const robotsValue = route.noindex ? "noindex, follow" : "index, follow";

    document.title = route.title;
    upsertCanonical(canonicalUrl);

    upsertMetaByName("description", route.description);
    upsertMetaByName("robots", robotsValue);
    upsertMetaByName("twitter:card", "summary_large_image");
    upsertMetaByName("twitter:title", route.title);
    upsertMetaByName("twitter:description", route.description);
    upsertMetaByName("twitter:image", DEFAULT_IMAGE_URL);
    upsertMetaByName("twitter:image:alt", DEFAULT_IMAGE_ALT);

    if (route.keywords) {
      upsertMetaByName("keywords", route.keywords);
    } else {
      const keywordsMeta = document.head.querySelector<HTMLMetaElement>(
        'meta[name="keywords"]',
      );
      keywordsMeta?.remove();
    }

    upsertMetaByProperty("og:type", "website");
    upsertMetaByProperty("og:title", route.title);
    upsertMetaByProperty("og:description", route.description);
    upsertMetaByProperty("og:url", canonicalUrl);
    upsertMetaByProperty("og:site_name", SITE_NAME);
    upsertMetaByProperty("og:image", DEFAULT_IMAGE_URL);
    upsertMetaByProperty("og:image:alt", DEFAULT_IMAGE_ALT);

    upsertJsonLd({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: route.title,
      description: route.description,
      url: canonicalUrl,
      isPartOf: {
        "@type": "WebSite",
        name: SITE_NAME,
        url: SITE_URL,
      },
    });
  }, [location.pathname]);

  return null;
}
