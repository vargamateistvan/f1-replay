import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Driver } from "@/api/types";
import { CHART_END_LABEL_GAP_PX } from "@/constants";
import { teamColor } from "@/utils/color";
import { spreadLabels } from "@/utils/chartLabels";

export interface EndLabel {
  readonly driverNumber: number;
  readonly value: number;
}

interface Props {
  readonly labels: readonly EndLabel[];
  readonly drivers: readonly Driver[];
  /** Values at the top and bottom edges of the plot area. */
  readonly domain: readonly [number, number];
  /** Plot area insets from the top/bottom of this column (chart margins + axis). */
  readonly plotTop: number;
  readonly plotBottom: number;
  readonly highlight: number | null;
  readonly onHover?: (driverNumber: number | null) => void;
  readonly onSelect?: (driverNumber: number) => void;
  /** Gutter width (the chart's right margin). */
  readonly widthPx: number;
  readonly className?: string;
}

/**
 * Driver acronyms at the right edge of a line chart, next to where each line
 * ends, spread apart so they never overlap. Hover highlights a line; click
 * focuses the driver.
 */
export function DriverEndLabels({
  labels,
  drivers,
  domain,
  plotTop,
  plotBottom,
  highlight,
  onHover,
  onSelect,
  widthPx,
  className = "",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setHeight(el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h !== undefined) setHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  const placed = useMemo(() => {
    const plotH = height - plotTop - plotBottom;
    if (plotH <= 0) return new Map<number, number>();
    const [top, bottom] = domain;
    const span = bottom - top || 1;
    const items = labels.map((l) => {
      const f = Math.min(Math.max((l.value - top) / span, 0), 1);
      return { id: l.driverNumber, y: plotTop + f * plotH };
    });
    return spreadLabels(items, CHART_END_LABEL_GAP_PX, plotTop, plotTop + plotH);
  }, [labels, domain, height, plotTop, plotBottom]);

  return (
    <div
      ref={ref}
      className={`pointer-events-none ${className}`}
      style={{ width: widthPx }}
      onMouseLeave={() => onHover?.(null)}
    >
      {labels.map(({ driverNumber }) => {
        const y = placed.get(driverNumber);
        if (y === undefined) return null;
        const driver = driverByNumber.get(driverNumber);
        const acronym = driver?.name_acronym ?? String(driverNumber);
        const color = teamColor(driver?.team_colour);
        const dimmed = highlight !== null && highlight !== driverNumber;
        const Tag = onSelect ? "button" : "span";
        return (
          <Tag
            key={driverNumber}
            {...(onSelect
              ? {
                  type: "button" as const,
                  onClick: () => onSelect(driverNumber),
                  "aria-label": `Focus ${acronym}`,
                }
              : {})}
            onMouseEnter={() => onHover?.(driverNumber)}
            className={`pointer-events-auto absolute left-1 flex -translate-y-1/2 items-center gap-1 text-tiny font-black leading-none transition-opacity ${
              dimmed ? "opacity-35" : ""
            } ${highlight === driverNumber ? "z-10" : ""}`}
            style={{ top: y, color }}
          >
            <span className="h-0.5 w-1.5 shrink-0" style={{ background: color }} aria-hidden="true" />
            {acronym}
          </Tag>
        );
      })}
    </div>
  );
}
