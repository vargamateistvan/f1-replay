import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

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
  readonly height?: number;
  readonly interactiveControls?: boolean;
}

export function TelemetryChart({
  title,
  xData,
  series,
  yMin,
  yMax,
  height = 120,
  interactiveControls = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const fullRangeRef = useRef<{ min: number; max: number } | null>(null);
  const currentRangeRef = useRef<{ min: number; max: number } | null>(null);

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
          stroke: "#6b7280",
          grid: { stroke: "#1e2d4a", width: 1 },
          ticks: { stroke: "#1e2d4a" },
          values: (_u, vals) => vals.map((v) => `${Math.round(v)}m`),
        },
        {
          stroke: "#6b7280",
          grid: { stroke: "#1e2d4a", width: 1 },
          ticks: { stroke: "#1e2d4a" },
        },
      ],
      series: [
        { label: "Dist" },
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color,
          width: s.width ?? 1.5,
          fill: s.fill,
          points: { show: s.points ?? false },
          scale: s.scale ?? "y",
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
      if (range) currentRangeRef.current = range;
    };
    if (nextPlot.hooks) {
      nextPlot.hooks.setScale = [
        ...(nextPlot.hooks.setScale ?? []),
        onSetScale,
      ];
    }

    return () => {
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [xData, series, height, title, yMin, yMax]);

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

  // Wheel zoom around cursor, plus double-click reset.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const plot = plotRef.current as
        | (uPlot & { posToVal?: (px: number, scale: string) => number })
        | null;
      if (!plot || !plot.posToVal) return;

      const rect = el.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const anchor = plot.posToVal(px, "x");
      zoom(event.deltaY > 0 ? 1.18 : 0.84, anchor);
    };

    const onDoubleClick = () => {
      resetZoom();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDoubleClick);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDoubleClick);
    };
  });

  if (xData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted text-xs bg-surface rounded border border-panel"
        style={{ height }}
      >
        No data
      </div>
    );
  }

  return (
    <div className="bg-surface rounded border border-panel overflow-hidden">
      {interactiveControls && (
        <div className="flex items-center gap-1 border-b border-panel bg-[#11131c] px-2 py-1">
          <span className="text-[9px] uppercase tracking-widest text-muted">
            Zoom
          </span>
          <button
            type="button"
            onClick={() => pan(-0.2)}
            className="h-6 w-6 rounded border border-panel/80 text-[11px] text-white/80 hover:text-white hover:border-white/60"
            title="Pan left"
            aria-label="Pan left"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => zoom(0.82)}
            className="h-6 w-6 rounded border border-panel/80 text-[11px] text-white/80 hover:text-white hover:border-white/60"
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoom(1.22)}
            className="h-6 w-6 rounded border border-panel/80 text-[11px] text-white/80 hover:text-white hover:border-white/60"
            title="Zoom out"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => pan(0.2)}
            className="h-6 w-6 rounded border border-panel/80 text-[11px] text-white/80 hover:text-white hover:border-white/60"
            title="Pan right"
            aria-label="Pan right"
          >
            →
          </button>
          <button
            type="button"
            onClick={resetZoom}
            className="ml-1 h-6 px-2 rounded border border-panel/80 text-[9px] font-bold uppercase tracking-widest text-white/80 hover:text-white hover:border-white/60"
            title="Reset zoom"
            aria-label="Reset zoom"
          >
            Reset
          </button>
          <span className="ml-auto text-[9px] text-muted hidden sm:inline">
            Wheel to zoom · drag to select
          </span>
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
}
