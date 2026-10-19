import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RouteSeo } from "@/components/Seo/RouteSeo";
import { usePageSeo } from "@/hooks/usePageSeo";
import type { PageSeo } from "@/components/Seo/seo";

function PageWithSeo({ seo }: { seo: PageSeo | null }) {
  usePageSeo(seo);
  return null;
}

function renderWithRouter(pathname: string, page?: PageSeo | null) {
  return render(
    <MemoryRouter
      initialEntries={[pathname]}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <RouteSeo />
      {page !== undefined && <PageWithSeo seo={page} />}
    </MemoryRouter>,
  );
}

describe("RouteSeo", () => {
  it("applies metadata for a known route", () => {
    renderWithRouter("/telemetry/");

    expect(document.title).toBe(
      "F1 Telemetry Comparison | Lap-by-Lap Driver Analysis",
    );
    expect(
      document.head
        .querySelector('link[rel="canonical"]')
        ?.getAttribute("href"),
    ).toBe("https://f1replay.app/telemetry");
    expect(
      document.head
        .querySelector('meta[name="keywords"]')
        ?.getAttribute("content"),
    ).toContain("telemetry comparison");
    expect(
      document.head
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content"),
    ).toBe("F1 Telemetry Comparison | Lap-by-Lap Driver Analysis");
    expect(document.getElementById("route-jsonld")?.textContent).toContain(
      "https://schema.org",
    );
  });

  it("falls back to default noindex metadata for unknown routes", () => {
    renderWithRouter("/missing");

    expect(document.title).toBe("F1 Replay | Formula 1 Data Replay Platform");
    expect(
      document.head
        .querySelector('meta[name="robots"]')
        ?.getAttribute("content"),
    ).toBe("noindex, follow");
    expect(document.head.querySelector('meta[name="keywords"]')).toBeNull();
  });

  it("uses a PNG social image", () => {
    renderWithRouter("/");

    expect(
      document.head
        .querySelector('meta[property="og:image"]')
        ?.getAttribute("content"),
    ).toBe("https://f1replay.app/og-cover.png");
  });

  it("indexes driver profiles with generic metadata until data loads", () => {
    renderWithRouter("/standings/driver/1", null);

    expect(document.title).toContain("Driver Season Profile");
    expect(
      document.head
        .querySelector('meta[name="robots"]')
        ?.getAttribute("content"),
    ).toBe("index, follow");
    expect(
      document.head
        .querySelector('link[rel="canonical"]')
        ?.getAttribute("href"),
    ).toBe("https://f1replay.app/standings/driver/1");
  });

  it("lets a page override title, description, canonical and breadcrumb", () => {
    renderWithRouter("/standings/driver/1", {
      title: "Max Verstappen 2025 F1 Season",
      description: "P1 on 400 points.",
      canonicalPath: "/standings/driver/1?year=2025",
      breadcrumb: "Max Verstappen",
    });

    expect(document.title).toBe("Max Verstappen 2025 F1 Season");
    expect(
      document.head
        .querySelector('meta[property="og:description"]')
        ?.getAttribute("content"),
    ).toBe("P1 on 400 points.");
    expect(
      document.head
        .querySelector('link[rel="canonical"]')
        ?.getAttribute("href"),
    ).toBe("https://f1replay.app/standings/driver/1?year=2025");
    const jsonLd = document.getElementById("route-jsonld")?.textContent ?? "";
    expect(jsonLd).toContain('"name":"Max Verstappen"');
    expect(document.querySelectorAll("#route-jsonld")).toHaveLength(1);
  });
});
