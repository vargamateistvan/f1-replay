import routeEntries from "../../../seo-routes.json";

const SITE_NAME = "F1 Replay";
const SITE_URL = "https://f1replay.app";
// Social crawlers (X, Facebook, LinkedIn, Slack) don't render SVG og:image.
const DEFAULT_IMAGE_URL = `${SITE_URL}/og-cover.png`;
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

/** Per-page metadata for routes whose content depends on loaded data. */
export type PageSeo = {
  title: string;
  description: string;
  /** Canonical path incl. any meaningful query (e.g. a non-default `?year=`). */
  canonicalPath?: string;
  /** Last breadcrumb label (e.g. the driver's name). */
  breadcrumb?: string;
};

export type ResolvedSeo = {
  title: string;
  description: string;
  keywords?: string;
  canonicalPath: string;
  noindex: boolean;
  breadcrumb?: string;
};

/** Parametrised routes: indexable, with a generic shell until the page calls usePageSeo. */
const PATTERN_ROUTES: Array<{ re: RegExp; route: Omit<ResolvedSeo, "canonicalPath"> }> = [
  {
    re: /^\/standings\/driver\/[^/]+$/,
    route: {
      title: "F1 Driver Season Profile | Results, Points & Head-to-Heads",
      description:
        "Formula 1 driver season profile: race and sprint results, qualifying, championship position by round, and teammate head-to-heads.",
      noindex: false,
      breadcrumb: "Driver",
    },
  },
  {
    re: /^\/standings\/team\/[^/]+$/,
    route: {
      title: "F1 Constructor Season Profile | Results, Points & Driver Line-up",
      description:
        "Formula 1 constructor season profile: per-car race results, points by round, championship position, and driver points share.",
      noindex: false,
      breadcrumb: "Team",
    },
  },
];

const JSONLD_ID = "route-jsonld";

const ROUTES: Record<string, RouteDefinition> = Object.fromEntries(
  (routeEntries as RouteDefinition[]).map((route) => [
    normalizePath(route.path),
    route,
  ]),
);

export function normalizePath(pathname: string): string {
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
  // Same id as the static block in index.html / the prerendered route shells,
  // so the runtime replaces it instead of duplicating it.
  let node = document.getElementById(JSONLD_ID) as HTMLScriptElement | null;
  if (!node) {
    node = document.createElement("script");
    node.id = JSONLD_ID;
    node.type = "application/ld+json";
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(jsonLd);
}

function collectBreadcrumbs(pathname: string, leaf?: string) {
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
  if (leaf && !ROUTES[pathname]) {
    crumbs.push({ name: leaf, url: `${SITE_URL}${pathname}` });
  }

  return crumbs;
}

function buildRouteSchemas(
  pathname: string,
  title: string,
  description: string,
  canonicalUrl: string,
  leaf?: string,
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

  const breadcrumbs = collectBreadcrumbs(pathname, leaf);
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

export function resolveRoute(pathname: string): ResolvedSeo {
  const route = ROUTES[pathname];
  if (route) return { ...route, canonicalPath: route.path };
  const pattern = PATTERN_ROUTES.find((p) => p.re.test(pathname));
  if (pattern) return { ...pattern.route, canonicalPath: pathname };
  return {
    title: "F1 Replay | Formula 1 Data Replay Platform",
    description:
      "Interactive Formula 1 replay platform with telemetry, strategy analysis, race control, and live timing visualizations.",
    canonicalPath: pathname,
    noindex: true,
  };
}

export function applySeo(pathname: string, seo: ResolvedSeo) {
  const canonicalUrl = `${SITE_URL}${seo.canonicalPath}`;
  const robotsValue = seo.noindex ? "noindex, follow" : "index, follow";

  document.title = seo.title;
  upsertCanonical(canonicalUrl);
  upsertHreflang("en", canonicalUrl);
  upsertHreflang("x-default", canonicalUrl);

  upsertMetaByName("description", seo.description);
  upsertMetaByName("application-name", SITE_NAME);
  upsertMetaByName("apple-mobile-web-app-title", SITE_NAME);
  upsertMetaByName("format-detection", "telephone=no");
  upsertMetaByName("robots", robotsValue);
  upsertMetaByName("twitter:card", "summary_large_image");
  upsertMetaByName("twitter:title", seo.title);
  upsertMetaByName("twitter:description", seo.description);
  upsertMetaByName("twitter:image", DEFAULT_IMAGE_URL);
  upsertMetaByName("twitter:image:alt", DEFAULT_IMAGE_ALT);

  if (seo.keywords) {
    upsertMetaByName("keywords", seo.keywords);
  } else {
    const keywordsMeta = document.head.querySelector<HTMLMetaElement>(
      'meta[name="keywords"]',
    );
    keywordsMeta?.remove();
  }

  upsertMetaByProperty("og:type", "website");
  upsertMetaByProperty("og:title", seo.title);
  upsertMetaByProperty("og:description", seo.description);
  upsertMetaByProperty("og:url", canonicalUrl);
  upsertMetaByProperty("og:site_name", SITE_NAME);
  upsertMetaByProperty("og:locale", DEFAULT_LOCALE);
  upsertMetaByProperty("og:image", DEFAULT_IMAGE_URL);
  upsertMetaByProperty("og:image:type", "image/png");
  upsertMetaByProperty("og:image:width", "1200");
  upsertMetaByProperty("og:image:height", "630");
  upsertMetaByProperty("og:image:alt", DEFAULT_IMAGE_ALT);

  upsertJsonLd(
    buildRouteSchemas(
      pathname,
      seo.title,
      seo.description,
      canonicalUrl,
      seo.breadcrumb,
    ),
  );
}
