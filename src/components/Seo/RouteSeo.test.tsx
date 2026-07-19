import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RouteSeo } from "@/components/Seo/RouteSeo";

function renderWithRouter(pathname: string) {
  return render(
    <MemoryRouter
      initialEntries={[pathname]}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <RouteSeo />
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
    expect(document.getElementById("route-seo-jsonld")?.textContent).toContain(
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
});
