import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

export interface ChartSeries {
  label: string
  color: string
  data: number[]
  scale?: string
  width?: number
  fill?: string
  points?: boolean
}

interface Props {
  readonly title: string
  readonly xData: number[]      // shared x axis (distance in metres)
  readonly series: ChartSeries[]
  readonly yMin?: number
  readonly yMax?: number
  readonly yLabel?: string
  readonly height?: number
}

export function TelemetryChart({ title, xData, series, yMin, yMax, height = 120 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  useEffect(() => {
    if (!containerRef.current || xData.length === 0) return

    const w = containerRef.current.clientWidth || 800

    const opts: uPlot.Options = {
      width: w,
      height,
      title,
      cursor: { sync: { key: 'telemetry' } },
      scales: {
        x: { time: false },
        y: { range: yMin !== undefined && yMax !== undefined ? [yMin, yMax] : undefined },
      },
      axes: [
        {
          stroke: '#6b7280',
          grid: { stroke: '#1e2d4a', width: 1 },
          ticks: { stroke: '#1e2d4a' },
          values: (_u, vals) => vals.map((v) => `${Math.round(v)}m`),
        },
        {
          stroke: '#6b7280',
          grid: { stroke: '#1e2d4a', width: 1 },
          ticks: { stroke: '#1e2d4a' },
        },
      ],
      series: [
        { label: 'Dist' },
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color,
          width: s.width ?? 1.5,
          fill: s.fill,
          points: { show: s.points ?? false },
          scale: s.scale ?? 'y',
        })),
      ],
    }

    const data: uPlot.AlignedData = [
      new Float64Array(xData),
      ...series.map((s) => new Float64Array(s.data)),
    ]

    plotRef.current?.destroy()
    plotRef.current = new uPlot(opts, data, containerRef.current)

    return () => {
      plotRef.current?.destroy()
      plotRef.current = null
    }
  }, [xData, series, height, title, yMin, yMax])

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry && plotRef.current) {
        plotRef.current.setSize({ width: entry.contentRect.width, height })
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [height])

  if (xData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted text-xs bg-surface rounded border border-panel"
        style={{ height }}
      >
        No data
      </div>
    )
  }

  return (
    <div className="bg-surface rounded border border-panel overflow-hidden">
      <div ref={containerRef} />
    </div>
  )
}
