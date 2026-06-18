import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE_NAME = "F1 Replay";
const SITE_URL = "https://f1replay.app";
const DEFAULT_IMAGE_URL = `${SITE_URL}/og-cover.svg`;
const DEFAULT_IMAGE_ALT =
  "F1 Replay app preview showing telemetry, strategy, and live timing";

type RouteDefinition = {
  title: string;
  description: string;
  path: string;
  keywords?: string;
  noindex?: boolean;
};

const ROUTES: Record<string, RouteDefinition> = {
  "/": {
    title:
      "F1 Replay | Formula 1 Race Replay, Telemetry, Strategy & Live Timing",
    description:
      "Relive Formula 1 sessions with synchronized telemetry, strategy timelines, live timing, race control, weather, and track map visualizations.",
    path: "/",
    keywords:
      "Formula 1 replay, F1 telemetry, F1 strategy, F1 live timing, OpenF1 race replay",
  },
  "/telemetry": {
    title: "F1 Telemetry Comparison | Lap-by-Lap Driver Analysis",
    description:
      "Compare Formula 1 driver laps with synchronized speed, throttle, brake, gear, and RPM traces to uncover where lap time is won or lost.",
    path: "/telemetry",
    keywords:
      "F1 telemetry comparison, Formula 1 lap analysis, speed trace, throttle trace",
  },
  "/standings": {
    title: "F1 Standings Dashboard | Driver & Constructor Points",
    description:
      "Explore Formula 1 championship standings with interactive driver and constructor points views, wins, and podium trends.",
    path: "/standings",
    keywords: "F1 standings, Formula 1 driver standings, constructor standings",
  },
  "/settings": {
    title: "F1 Replay Settings | Customize Your Pit Wall Experience",
    description:
      "Control playback, map overlays, telemetry density, and notifications to tailor your Formula 1 replay experience.",
    path: "/settings",
    keywords:
      "F1 replay settings, telemetry UI settings, Formula 1 app preferences",
    noindex: true,
  },
};

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
