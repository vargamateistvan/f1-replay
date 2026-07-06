import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import routeEntries from "../../../seo-routes.json";

const SITE_NAME = "F1 Replay";
const SITE_URL = "https://f1replay.app";
const DEFAULT_IMAGE_URL = `${SITE_URL}/og-cover.svg`;
const DEFAULT_IMAGE_ALT =
  "F1 Replay app preview showing telemetry, strategy, and live timing";
const DEFAULT_LOCALE = "en_US";

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

type JsonLd = Record<string, unknown>;

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
    `meta[name="${name}"]`,
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
    `meta[property="${property}"]`,
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

function upsertHreflang(hreflang: string, href: string) {
  let node = document.head.querySelector<HTMLLinkElement>(
    `link[rel="alternate"][hreflang="${hreflang}"]`,
  );
  if (!node) {
    node = document.createElement("link");
    node.setAttribute("rel", "alternate");
    node.setAttribute("hreflang", hreflang);
    document.head.appendChild(node);
  }
  node.setAttribute("href", href);
}

function upsertJsonLd(jsonLd: JsonLd | JsonLd[]) {
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

function collectBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  const crumbs: Array<{ name: string; url: string }> = [
    { name: "Home", url: `${SITE_URL}/` },
  ];

  let currentPath = "";
  for (const segment of segments) {
    currentPath += `/${segment}`;
    const route = ROUTES[normalizePath(currentPath)];
    if (!route) continue;
    crumbs.push({ name: route.title, url: `${SITE_URL}${route.path}` });
  }

  return crumbs;
}

function buildRouteSchemas(
  pathname: string,
  title: string,
  description: string,
  canonicalUrl: string,
): JsonLd[] {
  const schemas: JsonLd[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description,
      url: canonicalUrl,
      inLanguage: "en",
      isPartOf: {
        "@type": "WebSite",
        name: SITE_NAME,
        url: SITE_URL,
      },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: DEFAULT_IMAGE_URL,
      },
    },
  ];

  const breadcrumbs = collectBreadcrumbs(pathname);
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

  if (pathname === "/") {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "SportsApplication",
      operatingSystem: "Web",
      url: `${SITE_URL}/`,
      description,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    });
  }

  return schemas;
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
    const routeSchemas = buildRouteSchemas(
      pathname,
      route.title,
      route.description,
      canonicalUrl,
    );

    document.title = route.title;
    upsertCanonical(canonicalUrl);
    upsertHreflang("en", canonicalUrl);
    upsertHreflang("x-default", canonicalUrl);

    upsertMetaByName("description", route.description);
    upsertMetaByName("application-name", SITE_NAME);
    upsertMetaByName("apple-mobile-web-app-title", SITE_NAME);
    upsertMetaByName("format-detection", "telephone=no");
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
    upsertMetaByProperty("og:locale", DEFAULT_LOCALE);
    upsertMetaByProperty("og:image", DEFAULT_IMAGE_URL);
    upsertMetaByProperty("og:image:width", "1200");
    upsertMetaByProperty("og:image:height", "630");
    upsertMetaByProperty("og:image:alt", DEFAULT_IMAGE_ALT);

    upsertJsonLd(routeSchemas);
  }, [location.pathname]);

  return null;
}
