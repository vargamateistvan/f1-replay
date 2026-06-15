import { useEffect, useRef, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { applyGeoAffine } from "@/geometry/align";
import { getCircuitGeometry } from "@/data/circuitGeometry";
import { useCarPositions } from "@/hooks/useCarPositions";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import type { Driver, Location, Stint } from "@/api/types";
import type { CircuitGeometry, GeoAffine } from "@/data/circuitGeometryTypes";
import type { CarPosition } from "@/hooks/useCarPositions";
import type { LeaderboardRow } from "./TrackMap";

// ── GeoJSON builders ──────────────────────────────────────────────────────────

type LngLat = [number, number];

function buildTrackGeoJSON(geom: CircuitGeometry, affine: GeoAffine) {
  const coordinates: LngLat[] = geom.x.map((x, i) => {
    const { lng, lat } = applyGeoAffine(affine, x, geom.y[i]!);
    return [lng, lat];
  });
  if (coordinates.length > 0) coordinates.push(coordinates[0]!); // close loop
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates },
        properties: {},
      },
    ],
  };
}

function buildCarsGeoJSON(
  positions: CarPosition[],
  affine: GeoAffine,
  driverByNumber: Map<number, Driver>,
  focusDriver: number | null,
) {
  return {
    type: "FeatureCollection" as const,
    features: positions.map(({ num, x, y }) => {
      const { lng, lat } = applyGeoAffine(affine, x, y);
      const driver = driverByNumber.get(num);
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [lng, lat] as LngLat },
        properties: {
          num,
          color: teamColor(driver?.team_colour),
          acronym: driver?.name_acronym ?? String(num),
          // 1/0 because MapLibre boolean properties can behave unexpectedly in expressions
          focused: focusDriver === num ? 1 : 0,
        },
      };
    }),
  };
}

// ── MapLibre style ────────────────────────────────────────────────────────────
// Esri World Imagery — free, no API key, referrer-restricted on their end.

const ESRI_ATTRIBUTION =
  "Tiles © Esri — Source: Esri, USGS, NOAA";

function makeMapStyle(showLabels: boolean): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      satellite: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: ESRI_ATTRIBUTION,
        maxzoom: 19,
      },
      ...(showLabels
        ? {
            labels: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
              maxzoom: 19,
            },
          }
        : {}),
    },
    layers: [
      { id: "satellite", type: "raster", source: "satellite" },
      ...(showLabels
        ? [
            {
              id: "labels",
              type: "raster" as const,
              source: "labels",
              paint: { "raster-opacity": 0.45 },
            },
          ]
        : []),
    ],
  };
}

// ── Source/layer IDs ──────────────────────────────────────────────────────────

const TRACK_SOURCE = "f1-track";
const CARS_SOURCE = "f1-cars";

// ── Component ─────────────────────────────────────────────────────────────────

export interface Props {
  readonly sessionKey: number | null;
  readonly drivers: Driver[];
  readonly locationData: Location[];
  readonly sessionStartMs: number;
  readonly focusDriver?: number | null;
  readonly circuitKey?: number | null;
  readonly retiredDrivers?: ReadonlySet<number>;
  readonly leaderboard?: readonly LeaderboardRow[];
  readonly activeCompounds?: ReadonlyMap<
    number,
    { compound: Stint["compound"]; age: number }
  >;
  readonly onSelectDriver?: (driverNumber: number) => void;
}

export function TrackMapSatellite({
  sessionKey,
  drivers,
  locationData,
  sessionStartMs,
  focusDriver = null,
  circuitKey = null,
  retiredDrivers,
  leaderboard,
}: Props) {
  const { satelliteOpacity, satelliteLabels } = useSettings();

  const circuitGeom = circuitKey != null ? getCircuitGeometry(circuitKey) : null;
  const affine = circuitGeom?.geoAffine ?? null;

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  // 60 Hz car positions
  const carPositions = useCarPositions(locationData, sessionStartMs, retiredDrivers);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);

  // ── Map init / teardown ────────────────────────────────────────────────────
  // Reinit only when the circuit changes (affine or geom).
  useEffect(() => {
    if (!mapContainerRef.current || !affine || !circuitGeom) return;

    // Compute track lng/lat bounds for fitBounds
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    for (let i = 0; i < circuitGeom.x.length; i++) {
      const { lng, lat } = applyGeoAffine(affine, circuitGeom.x[i]!, circuitGeom.y[i]!);
      if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    }
    const pad = 0.002; // ~200m padding
    const bounds: [LngLat, LngLat] = [
      [minLng - pad, minLat - pad],
      [maxLng + pad, maxLat + pad],
    ];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: makeMapStyle(satelliteLabels),
      bounds,
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: true },
    });

    const trackData = buildTrackGeoJSON(circuitGeom, affine);

    map.on("load", () => {
      // Track ribbon
      map.addSource(TRACK_SOURCE, { type: "geojson", data: trackData });
      map.addLayer({
        id: "track-base",
        type: "line",
        source: TRACK_SOURCE,
        paint: {
          "line-color": "#3a3a45",
          "line-width": 11,
          "line-opacity": satelliteOpacity,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "track-surface",
        type: "line",
        source: TRACK_SOURCE,
        paint: {
          "line-color": "#5a5a66",
          "line-width": 7,
          "line-opacity": satelliteOpacity,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "track-highlight",
        type: "line",
        source: TRACK_SOURCE,
        paint: {
          "line-color": "#ffffff",
          "line-width": 1.5,
          "line-opacity": satelliteOpacity * 0.2,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });

      // Cars
      map.addSource(CARS_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "cars-halo",
        type: "circle",
        source: CARS_SOURCE,
        filter: ["==", ["get", "focused"], 1],
        paint: {
          "circle-radius": 14,
          "circle-color": ["get", "color"],
          "circle-opacity": 0.2,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-opacity": 0.5,
        },
      });
      map.addLayer({
        id: "cars-circle",
        type: "circle",
        source: CARS_SOURCE,
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "focused"], 1],
            9,
            6,
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.7,
        },
      });
      map.addLayer({
        id: "cars-label",
        type: "symbol",
        source: CARS_SOURCE,
        layout: {
          "text-field": ["get", "acronym"],
          "text-size": ["case", ["==", ["get", "focused"], 1], 12, 10],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-anchor": "bottom",
          "text-offset": [0, -1.2],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": ["get", "color"],
          "text-halo-color": "#000000",
          "text-halo-width": 1.5,
        },
      });

      mapReadyRef.current = true;
    });

    mapRef.current = map;
    return () => {
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [affine, circuitGeom, satelliteLabels]); // reinit on circuit or labels toggle

  // ── Car position updates (60 Hz) ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current || !affine) return;
    const source = map.getSource(CARS_SOURCE);
    if (!source || source.type !== "geojson") return;
    (source as maplibregl.GeoJSONSource).setData(
      buildCarsGeoJSON(carPositions, affine, driverByNumber, focusDriver),
    );
  }, [carPositions, affine, driverByNumber, focusDriver]);

  // ── Track ribbon opacity ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    map.setPaintProperty("track-base", "line-opacity", satelliteOpacity);
    map.setPaintProperty("track-surface", "line-opacity", satelliteOpacity);
    map.setPaintProperty("track-highlight", "line-opacity", satelliteOpacity * 0.2);
  }, [satelliteOpacity]);

  // ── No geo affine ─────────────────────────────────────────────────────────
  if (!affine) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-2 text-muted text-center px-6">
        <span className="text-[13px] font-bold text-white/60">
          Satellite view unavailable
        </span>
        <span className="text-[11px] leading-snug">
          No geo-reference data for this circuit.
          <br />
          Run <code className="text-white/50 text-[10px]">node scripts/fetch-circuits.mjs</code> and re-deploy.
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Mini-leaderboard overlay */}
      {leaderboard && leaderboard.length > 0 && (
        <div
          className="absolute bottom-2 left-2 flex flex-col gap-px pointer-events-none"
          style={{ minWidth: 110 }}
        >
          {leaderboard.map((row) => (
            <div
              key={row.num}
              className="flex items-center gap-1.5 px-1.5 py-0.5"
              style={{
                background: "rgba(21,21,30,0.82)",
                backdropFilter: "blur(4px)",
              }}
            >
              <span className="text-[9px] font-black tabular-nums text-muted w-4 text-right shrink-0">
                {row.pos}
              </span>
              <span
                className="w-[2px] self-stretch shrink-0 rounded-sm"
                style={{ background: row.color }}
              />
              <span
                className="text-[10px] font-black uppercase tracking-wide flex-1"
                style={{ color: row.color }}
              >
                {row.acronym}
              </span>
              <span className="text-[9px] font-mono tabular-nums text-muted shrink-0">
                {row.gap}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
