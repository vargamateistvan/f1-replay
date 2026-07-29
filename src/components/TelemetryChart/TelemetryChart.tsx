import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { ErrorMessage } from "@/components/ErrorMessage";
import { useSettings } from "@/stores/settings";
import { FALLBACK_LANGUAGE } from "@/i18n/language";
import { t as tr } from "@/i18n/translations";

const X_SYNC_EVENT = "telemetrychart:x-sync";
const X_SYNC_GROUP = "telemetry";

let nextChartInstanceId = 1;

export interface ChartSeries {
  label: string;
  color: string;
  data: number[];
  scale?: string;
  width?: number;
  fill?: string;
  points?: boolean;
}

interface Props {
  readonly title: string;
  readonly xData: number[]; // shared x axis (distance in metres)
  readonly series: ChartSeries[];
  readonly yMin?: number;
  readonly yMax?: number;
  readonly yLabel?: string;
  readonly legendUnit?: string;
  readonly legendDecimals?: number;
  readonly distanceUnit?: string;
  readonly distanceScale?: number;
  readonly height?: number;
  readonly interactiveControls?: boolean;
  readonly onHoverX?: (x: number | null) => void;
}

interface ChartTheme {
  accent: string;
  grid: string;
  glow: string;
  bg: string;
}

function themeForTitle(title: string): ChartTheme {
  const t = title.toLowerCase();

  if (t.includes("speed")) {
    return {
      accent: "#5aa2ff",
      grid: "#2a3c66",
      glow: "rgba(78, 151, 255, 0.28)",
      bg: "radial-gradient(circle_at_top_right,rgba(76,132,255,0.2),transparent 40%),radial-gradient(circle_at_bottom_left,rgba(0,103,255,0.12),transparent 45%),linear-gradient(180deg,rgba(12,18,34,0.95),rgba(13,17,30,0.9))",
    };
  }

  if (t.includes("throttle")) {
    return {
      accent: "#41d97a",
      grid: "#274f3a",
      glow: "rgba(65, 217, 122, 0.22)",
      bg: "radial-gradient(circle_at_top_right,rgba(42,165,92,0.22),transparent 42%),radial-gradient(circle_at_bottom_left,rgba(29,128,74,0.16),transparent 45%),linear-gradient(180deg,rgba(12,28,24,0.95),rgba(12,22,20,0.9))",
    };
  }

  if (t.includes("brake")) {
    return {
      accent: "#ff6b7f",
      grid: "#5a2d3a",
      glow: "rgba(255, 92, 118, 0.24)",
      bg: "radial-gradient(circle_at_top_right,rgba(255,87,112,0.22),transparent 40%),radial-gradient(circle_at_bottom_left,rgba(188,42,70,0.16),transparent 45%),linear-gradient(180deg,rgba(34,13,22,0.95),rgba(30,13,20,0.9))",
    };
  }

  if (t.includes("gear")) {
    return {
      accent: "#f2ca5f",
      grid: "#5a4a2a",
      glow: "rgba(242, 202, 95, 0.22)",
      bg: "radial-gradient(circle_at_top_right,rgba(242,202,95,0.2),transparent 42%),radial-gradient(circle_at_bottom_left,rgba(171,126,36,0.16),transparent 46%),linear-gradient(180deg,rgba(33,24,12,0.95),rgba(28,21,12,0.9))",
    };
  }

  if (t.includes("rpm")) {
    return {
      accent: "#b58cff",
      grid: "#473366",
      glow: "rgba(181, 140, 255, 0.24)",
      bg: "radial-gradient(circle_at_top_right,rgba(177,122,255,0.22),transparent 40%),radial-gradient(circle_at_bottom_left,rgba(106,63,173,0.16),transparent 45%),linear-gradient(180deg,rgba(24,14,37,0.95),rgba(21,14,31,0.9))",
    };
  }

  if (t.includes("delta")) {
    return {
      accent: "#62d4ff",
      grid: "#2a4f5d",
      glow: "rgba(98, 212, 255, 0.24)",
      bg: "radial-gradient(circle_at_top_right,rgba(68,199,255,0.2),transparent 42%),radial-gradient(circle_at_bottom_left,rgba(41,139,196,0.16),transparent 45%),linear-gradient(180deg,rgba(12,24,34,0.95),rgba(12,20,30,0.9))",
    };
  }

  return {
    accent: "#8ea2ff",
    grid: "#2b3963",
    glow: "rgba(142, 162, 255, 0.22)",
    bg: "radial-gradient(circle_at_top_right,rgba(80,97,220,0.16),transparent 42%),radial-gradient(circle_at_bottom_left,rgba(232,0,45,0.08),transparent 40%),linear-gradient(180deg,rgba(13,15,24,0.95),rgba(14,16,26,0.9))",
  };
}

export function TelemetryChart({
  title,
  xData,
  series,
  yMin,
  yMax,
  height = 180,
  interactiveControls = false,
  onHoverX,
  legendUnit,
  legendDecimals,
  distanceUnit = "m",
  distanceScale = 1,
}: Props) {
  const theme = themeForTitle(title);
  const language = useSettings((s) => s.language ?? FALLBACK_LANGUAGE);
  const chartInstanceIdRef = useRef(nextChartInstanceId++);
  const suppressBroadcastRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const fullRangeRef = useRef<{ min: number; max: number } | null>(null);
  const currentRangeRef = useRef<{ min: number; max: number } | null>(null);
  const showSeriesChips = series.length > 0;

  const broadcastScale = (min: number, max: number) => {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
      new CustomEvent(X_SYNC_EVENT, {
        detail: {
          group: X_SYNC_GROUP,
          sourceId: chartInstanceIdRef.current,
          min,
          max,
        },
      }),
    );
  };

  const setXScale = (nextMin: number, nextMax: number) => {
    const plot = plotRef.current as
      | (uPlot & {
          setScale?: (k: string, v: { min: number; max: number }) => void;
        })
      | null;
    const full = fullRangeRef.current;
    if (!plot || !plot.setScale || !full) return;

    const minSpan = Math.max((full.max - full.min) / 400, 1);
    const clampedMin = Math.max(
      full.min,
      Math.min(nextMin, full.max - minSpan),
    );
    const clampedMax = Math.min(
      full.max,
      Math.max(nextMax, full.min + minSpan),
    );

    if (clampedMax - clampedMin < minSpan) {
      const center = (clampedMin + clampedMax) / 2;
      const half = minSpan / 2;
      plot.setScale("x", {
        min: Math.max(full.min, center - half),
        max: Math.min(full.max, center + half),
      });
      return;
    }

    plot.setScale("x", { min: clampedMin, max: clampedMax });
  };

  const readXScale = () => {
    const plot = plotRef.current;
    const min = plot?.scales?.x?.min;
    const max = plot?.scales?.x?.max;
    if (min == null || max == null) return currentRangeRef.current;
    return { min, max };
  };

  const zoom = (factor: number, anchor?: number) => {
    const range = readXScale();
    if (!range) return;
    const center = anchor ?? (range.min + range.max) / 2;
    const half = ((range.max - range.min) * factor) / 2;
    setXScale(center - half, center + half);
  };

  const pan = (ratio: number) => {
    const range = readXScale();
    if (!range) return;
    const span = range.max - range.min;
    const delta = span * ratio;
    setXScale(range.min + delta, range.max + delta);
  };

  const resetZoom = () => {
    const full = fullRangeRef.current;
    if (!full) return;
    setXScale(full.min, full.max);
  };

  useEffect(() => {
    if (!containerRef.current || xData.length === 0) return;

    const w = containerRef.current.clientWidth || 800;

    const opts: uPlot.Options = {
      width: w,
      height,
      title,
      cursor: {
        sync: { key: "telemetry" },
        drag: { x: true, y: false, setScale: true },
      },
      scales: {
        x: { time: false },
        y: {
          range:
            yMin !== undefined && yMax !== undefined ? [yMin, yMax] : undefined,
        },
      },
      axes: [
        {
          stroke: "#95a3bd",
          grid: { stroke: theme.grid, width: 1 },
          ticks: { stroke: theme.grid },
          values: (_u, vals) =>
            vals.map((v) => {
              const displayed = v * distanceScale;
              const formatted =
                Math.abs(displayed) >= 100
                  ? Math.round(displayed).toString()
                  : displayed.toFixed(1);
              return `${formatted} ${distanceUnit}`;
            }),
        },
        {
          stroke: "#95a3bd",
          grid: { stroke: theme.grid, width: 1 },
          ticks: { stroke: theme.grid },
        },
      ],
      series: [
        {
          label: `Dist (${distanceUnit})`,
          value: (_u: uPlot, rawValue: number | null) => {
            if (rawValue == null || !Number.isFinite(rawValue)) return "-";
            const displayed = rawValue * distanceScale;
            const formatted =
              Math.abs(displayed) >= 100
                ? Math.round(displayed).toString()
                : displayed.toFixed(1);
            return `${formatted} ${distanceUnit}`;
          },
        },
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color,
          width: s.width ?? 1.8,
          fill: s.fill,
          points: { show: s.points ?? false },
          scale: s.scale ?? "y",
          value: (_u: uPlot, rawValue: number | null) => {
            if (rawValue == null || !Number.isFinite(rawValue)) return "-";
            const decimals =
              typeof legendDecimals === "number"
                ? Math.max(0, legendDecimals)
                : Math.abs(rawValue) >= 100
                  ? 0
                  : 1;
            const rounded =
              decimals === 0
                ? Math.round(rawValue).toString()
                : rawValue.toFixed(decimals);
            return legendUnit ? `${rounded} ${legendUnit}` : rounded;
          },
        })),
      ],
    };

    const data: uPlot.AlignedData = [
      new Float64Array(xData),
      ...series.map((s) => new Float64Array(s.data)),
    ];

    const full = {
      min: xData[0] ?? 0,
      max: xData[xData.length - 1] ?? 0,
    };
    fullRangeRef.current = full;

    plotRef.current?.destroy();
    const nextPlot = new uPlot(opts, data, containerRef.current);
    plotRef.current = nextPlot;

    if (currentRangeRef.current) {
      setXScale(currentRangeRef.current.min, currentRangeRef.current.max);
    } else {
      currentRangeRef.current = full;
    }

    const onSetScale = () => {
      const range = readXScale();
      if (!range) return;

      currentRangeRef.current = range;
      if (!suppressBroadcastRef.current) {
        broadcastScale(range.min, range.max);
      }
    };

    const onSetCursor = (u: uPlot) => {
      if (!onHoverX) return;

      const idx = u.cursor?.idx;
      if (idx == null || idx < 0 || idx >= xData.length) {
        onHoverX(null);
        return;
      }

      const x = xData[idx];
      onHoverX(Number.isFinite(x) ? x : null);
    };

    if (nextPlot.hooks) {
      nextPlot.hooks.setScale = [
        ...(nextPlot.hooks.setScale ?? []),
        onSetScale,
      ];
      nextPlot.hooks.setCursor = [
        ...(nextPlot.hooks.setCursor ?? []),
        onSetCursor,
      ];
    }

    return () => {
      onHoverX?.(null);
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [
    xData,
    series,
    height,
    title,
    yMin,
    yMax,
    onHoverX,
    legendUnit,
    legendDecimals,
    distanceUnit,
    distanceScale,
    theme.grid,
  ]);

  // Keep x-axis zoom/pan synchronized across telemetry charts.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onSync = (event: Event) => {
      const customEvent = event as CustomEvent<{
        group: string;
        sourceId: number;
        min: number;
        max: number;
      }>;

      const payload = customEvent.detail;
      if (!payload || payload.group !== X_SYNC_GROUP) return;
      if (payload.sourceId === chartInstanceIdRef.current) return;

      suppressBroadcastRef.current = true;
      try {
        setXScale(payload.min, payload.max);
      } finally {
        suppressBroadcastRef.current = false;
      }
    };

    window.addEventListener(X_SYNC_EVENT, onSync);
    return () => {
      window.removeEventListener(X_SYNC_EVENT, onSync);
    };
  }, []);

  // Fallback hover tracking for test environments that do not emit uPlot
  // cursor hooks from synthetic pointer events.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onHoverX) return;

    const onMouseMove = (event: MouseEvent) => {
      const plot = plotRef.current;
      const range = readXScale();
      if (!plot || !range) return;

      const plotLeft = plot.bbox.left;
      const plotWidth = plot.bbox.width;
      if (!Number.isFinite(plotWidth) || plotWidth <= 0) return;

      const rect = el.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const relX = localX - plotLeft;
      const clampedRelX = Math.max(0, Math.min(plotWidth, relX));
      const ratio = clampedRelX / plotWidth;
      const x = range.min + (range.max - range.min) * ratio;

      onHoverX(Number.isFinite(x) ? x : null);
    };

    const onMouseLeave = () => {
      onHoverX(null);
    };

    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("mouseleave", onMouseLeave);
    return () => {
      el.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [onHoverX]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry && plotRef.current) {
        plotRef.current.setSize({ width: entry.contentRect.width, height });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [height]);

  // Double-click resets the current zoom window.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onDoubleClick = () => {
      resetZoom();
    };

    el.addEventListener("dblclick", onDoubleClick);
    return () => {
      el.removeEventListener("dblclick", onDoubleClick);
    };
  });

  if (xData.length === 0) {
    return (
      <div
        style={{ height }}
        className="rounded border border-panel bg-surface shadow-[0_14px_36px_rgba(0,0,0,0.24)]"
      >
        <ErrorMessage
          message={tr(language, "telemetryChart.noDataFound")}
          variant="empty"
        />
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded border border-panel bg-surface shadow-[0_14px_36px_rgba(0,0,0,0.26)] ring-1 ring-white/5 [&_.u-title]:px-3 [&_.u-title]:pt-2.5 [&_.u-title]:pb-1 [&_.u-title]:text-[11px] [&_.u-title]:font-black [&_.u-title]:uppercase [&_.u-title]:tracking-[0.12em] [&_.u-title]:text-white/90 [&_.u-legend]:mx-3 [&_.u-legend]:mb-2 [&_.u-legend]:rounded [&_.u-legend]:border [&_.u-legend]:border-panel/80 [&_.u-legend]:bg-black/20 [&_.u-legend]:px-2 [&_.u-legend]:py-1 [&_.u-legend]:text-[11px] [&_.u-legend]:font-medium [&_.u-legend_.u-label]:pr-2 [&_.u-legend_.u-value]:inline-block [&_.u-legend_.u-value]:min-w-[84px] [&_.u-legend_.u-value]:text-right [&_.u-legend_.u-value]:font-mono [&_.u-legend_.u-value]:[font-variant-numeric:tabular-nums] [&_.u-axis]:text-[10px] [&_.u-axis]:text-muted [&_.u-cursor-x]:bg-white/30 [&_.u-cursor-y]:bg-white/25"
      style={{
        boxShadow: `0 14px 36px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px ${theme.glow}`,
      }}
    >
      {interactiveControls && (
        <div
          className="flex items-center gap-1 border-b border-panel px-2 py-1.5"
          style={{
            background: `linear-gradient(90deg, rgba(18,20,31,0.95), rgba(14,16,24,0.9)), ${theme.bg}`,
          }}
        >
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted">
            {tr(language, "telemetryChart.zoom")}
          </span>
          <button
            type="button"
            onClick={() => pan(-0.2)}
            className="h-6 w-6 rounded border border-panel/80 bg-black/20 text-[11px] text-white/80 transition-colors hover:border-white/60 hover:text-white"
            title={tr(language, "telemetryChart.panLeft")}
            aria-label={tr(language, "telemetryChart.panLeft")}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => zoom(0.82)}
            className="h-6 w-6 rounded border border-panel/80 bg-black/20 text-[11px] text-white/80 transition-colors hover:border-white/60 hover:text-white"
            title={tr(language, "telemetryChart.zoomIn")}
            aria-label={tr(language, "telemetryChart.zoomIn")}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoom(1.22)}
            className="h-6 w-6 rounded border border-panel/80 bg-black/20 text-[11px] text-white/80 transition-colors hover:border-white/60 hover:text-white"
            title={tr(language, "telemetryChart.zoomOut")}
            aria-label={tr(language, "telemetryChart.zoomOut")}
          >
            −
          </button>
          <button
            type="button"
            onClick={() => pan(0.2)}
            className="h-6 w-6 rounded border border-panel/80 bg-black/20 text-[11px] text-white/80 transition-colors hover:border-white/60 hover:text-white"
            title={tr(language, "telemetryChart.panRight")}
            aria-label={tr(language, "telemetryChart.panRight")}
          >
            →
          </button>
          <button
            type="button"
            onClick={resetZoom}
            className="ml-1 h-6 rounded border border-panel/80 bg-black/20 px-2 text-[9px] font-bold uppercase tracking-widest text-white/80 transition-colors hover:border-white/60 hover:text-white"
            title={tr(language, "telemetryChart.resetZoom")}
            aria-label={tr(language, "telemetryChart.resetZoom")}
          >
            {tr(language, "telemetryChart.reset")}
          </button>

          {showSeriesChips && (
            <div className="ml-2 hidden items-center gap-1 lg:flex">
              {series.map((line, idx) => (
                <span
                  key={`${line.label}-${idx}`}
                  className="inline-flex items-center gap-1 rounded border border-panel/90 bg-track/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white/85"
                  style={{ boxShadow: `inset 0 0 0 1px ${line.color}33` }}
                  title={tr(language, "telemetryChart.seriesTitle", {
                    label: line.label,
                  })}
                >
                  <span
                    className="h-1.5 w-3 rounded-full"
                    style={{
                      backgroundColor: line.color,
                      boxShadow: `0 0 8px ${line.color}`,
                    }}
                  />
                  {line.label}
                </span>
              ))}
            </div>
          )}

          <span className="ml-auto hidden text-[9px] text-muted sm:inline">
            {tr(language, "telemetryChart.zoomHint")}
          </span>
        </div>
      )}

      {!interactiveControls && showSeriesChips && (
        <div className="flex flex-wrap items-center gap-1 border-b border-panel/80 bg-black/15 px-2 py-1.5">
          {series.map((line, idx) => (
            <span
              key={`${line.label}-${idx}`}
              className="inline-flex items-center gap-1 rounded border border-panel/90 bg-track/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white/85"
              style={{ boxShadow: `inset 0 0 0 1px ${line.color}33` }}
              title={tr(language, "telemetryChart.seriesTitle", {
                label: line.label,
              })}
            >
              <span
                className="h-1.5 w-3 rounded-full"
                style={{
                  backgroundColor: line.color,
                  boxShadow: `0 0 8px ${line.color}`,
                }}
              />
              {line.label}
            </span>
          ))}
        </div>
      )}

      <div ref={containerRef} style={{ background: theme.bg }} />
    </div>
  );
}
