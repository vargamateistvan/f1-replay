import { useMemo } from 'react'
import { SessionPicker } from '@/components/SessionPicker'
import { TelemetryChart } from '@/components/TelemetryChart/TelemetryChart'
import { ErrorMessage } from '@/components/ErrorMessage'
import { useDrivers, useLaps, useSessions } from '@/hooks/useSession'
import { useCarDataForLap, type TelemetrySample } from '@/hooks/useCarDataForLap'
import { useNumberParam, useStringParam } from '@/hooks/useSearchParamState'
import { teamColor } from '@/utils/color'
import { DEFAULT_YEAR } from '@/constants'

// Resample a driver's samples onto the reference driver's distance axis.
function resampleToAxis(ref: TelemetrySample[], other: TelemetrySample[]): TelemetrySample[] {
  if (other.length === 0) return []
  const maxDist = other[other.length - 1]!.distM
  return ref.map((r) => {
    const d = Math.min(r.distM, maxDist)
    let lo = 0, hi = other.length - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >>> 1
      if (other[mid]!.distM <= d) lo = mid; else hi = mid
    }
    const a = other[lo]!, b = other[hi]!
    const alpha = b.distM === a.distM ? 0 : (d - a.distM) / (b.distM - a.distM)
    const lerp = (av: number, bv: number) => av + (bv - av) * alpha
    return {
      distM: r.distM,
      timeS: lerp(a.timeS, b.timeS),
      speed: lerp(a.speed, b.speed),
      throttle: lerp(a.throttle, b.throttle),
      brake: lerp(a.brake, b.brake),
      rpm: lerp(a.rpm, b.rpm),
      gear: Math.round(lerp(a.gear, b.gear)),
      drs: lerp(a.drs, b.drs),
    }
  })
}

// Δ time of a resampled driver vs the reference at each distance point (+ = ref ahead).
function computeDelta(ref: TelemetrySample[], other: TelemetrySample[]): number[] {
  return ref.map((s, i) => s.timeS - (other[i]?.timeS ?? s.timeS))
}

// Centred moving-average low-pass for noisy traces.
function smooth(values: number[], window = 5): number[] {
  if (values.length === 0) return values
  const half = Math.floor(window / 2)
  const out = new Array<number>(values.length)
  for (let i = 0; i < values.length; i++) {
    let sum = 0, cnt = 0
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < values.length) { sum += values[j]!; cnt++ }
    }
    out[i] = sum / cnt
  }
  return out
}

interface PlotSlot {
  num: number
  label: string
  color: string
  data: TelemetrySample[]
}

const PANEL = 'bg-surface border border-panel'
const PANEL_TITLE = 'text-[10px] font-bold text-muted px-3 py-2 border-b border-[#38383f] uppercase tracking-[0.12em] border-l-2 border-l-f1red bg-track'
const LABEL = 'text-[10px] font-bold uppercase tracking-widest text-muted'
const SELECT = 'bg-panel text-white border border-[#38383f] text-xs font-medium px-3 py-1.5 focus:outline-none'
const SLOT_COLORS = ['#e8002d', '#0067ff', '#23c552']

export default function Telemetry() {
  const [yearParam, setYear] = useNumberParam('year', DEFAULT_YEAR)
  const year = yearParam ?? DEFAULT_YEAR
  const [meetingKey, setMeetingKey] = useNumberParam('meeting', null)
  const [sessionKey, setSessionKey] = useNumberParam('session', null)
  const [driverA, setDriverA] = useNumberParam('a', null)
  const [driverB, setDriverB] = useNumberParam('b', null)
  const [driverC, setDriverC] = useNumberParam('c', null)
  const [lapNumber, setLapNumber] = useNumberParam('lap', null)
  const [smoothParam, setSmooth] = useStringParam<'0' | '1'>('smooth', '0')
  const smoothing = smoothParam === '1'

  const sessions = useSessions(meetingKey)
  const drivers = useDrivers(sessionKey)
  const laps = useLaps(sessionKey) // all drivers — feeds lap list + sector splits

  const dataA = useCarDataForLap(sessionKey, driverA, lapNumber)
  const dataB = useCarDataForLap(sessionKey, driverB, lapNumber)
  const dataC = useCarDataForLap(sessionKey, driverC, lapNumber)

  const session = sessions.data?.find((s) => s.session_key === sessionKey)

  const availableLaps = useMemo(() => {
    if (!laps.data) return []
    return [...new Set(laps.data.map((l) => l.lap_number))].sort((a, b) => a - b)
  }, [laps.data])

  const driverByNumber = useMemo(
    () => new Map((drivers.data ?? []).map((d) => [d.driver_number, d])),
    [drivers.data],
  )

  const acr = (num: number | null, fallback: string) =>
    (num !== null && driverByNumber.get(num)?.name_acronym) || fallback
  const colorFor = (num: number | null, i: number) =>
    teamColor(num !== null ? driverByNumber.get(num)?.team_colour : undefined, SLOT_COLORS[i])

  // Reference axis = driver A; B and C are resampled onto it.
  const dataBResampled = useMemo(
    () => (dataA.data && dataB.data ? resampleToAxis(dataA.data, dataB.data) : null),
    [dataA.data, dataB.data],
  )
  const dataCResampled = useMemo(
    () => (dataA.data && dataC.data ? resampleToAxis(dataA.data, dataC.data) : null),
    [dataA.data, dataC.data],
  )

  const xDist = useMemo(() => dataA.data?.map((s) => s.distM) ?? [], [dataA.data])

  // Slots actually plotted (present data only), in A/B/C order.
  const plotSlots = useMemo<PlotSlot[]>(() => {
    const out: PlotSlot[] = []
    if (dataA.data?.length) out.push({ num: driverA!, label: acr(driverA, 'A'), color: colorFor(driverA, 0), data: dataA.data })
    if (driverB && dataBResampled?.length) out.push({ num: driverB, label: acr(driverB, 'B'), color: colorFor(driverB, 1), data: dataBResampled })
    if (driverC && dataCResampled?.length) out.push({ num: driverC, label: acr(driverC, 'C'), color: colorFor(driverC, 2), data: dataCResampled })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataA.data, dataBResampled, dataCResampled, driverA, driverB, driverC, driverByNumber])

  function series(
    key: keyof Omit<TelemetrySample, 'distM' | 'timeS'>,
    smoothable: boolean,
    withFill = false,
  ) {
    return plotSlots.map((s) => {
      const raw = s.data.map((d) => d[key] as number)
      return {
        label: s.label,
        color: s.color,
        fill: withFill ? `${s.color}26` : undefined,
        data: smoothing && smoothable ? smooth(raw) : raw,
      }
    })
  }

  // Δ-time lines: each comparison driver vs A.
  const deltaSeries = useMemo(() => {
    if (!dataA.data) return []
    const out: { label: string; color: string; fill?: string; data: number[] }[] = []
    if (driverB && dataBResampled) out.push({ label: acr(driverB, 'B'), color: colorFor(driverB, 1), data: computeDelta(dataA.data, dataBResampled) })
    if (driverC && dataCResampled) out.push({ label: acr(driverC, 'C'), color: colorFor(driverC, 2), data: computeDelta(dataA.data, dataCResampled) })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataA.data, dataBResampled, dataCResampled, driverB, driverC, driverByNumber])

  // Sector splits for the chosen lap, per selected driver.
  const splitRows = useMemo(() => {
    if (!lapNumber || !laps.data) return []
    const slots = [driverA, driverB, driverC]
    const rows = slots.flatMap((num, i) => {
      if (num === null) return []
      const lap = laps.data!.find((l) => l.driver_number === num && l.lap_number === lapNumber)
      if (!lap) return []
      return [{
        num, color: colorFor(num, i), acr: acr(num, String(num)),
        s1: lap.duration_sector_1, s2: lap.duration_sector_2, s3: lap.duration_sector_3, lap: lap.lap_duration,
      }]
    })
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laps.data, lapNumber, driverA, driverB, driverC, driverByNumber])

  const fastest = useMemo(() => {
    const min = (vals: (number | null)[]) => {
      const nums = vals.filter((v): v is number => v !== null)
      return nums.length ? Math.min(...nums) : null
    }
    return {
      s1: min(splitRows.map((r) => r.s1)),
      s2: min(splitRows.map((r) => r.s2)),
      s3: min(splitRows.map((r) => r.s3)),
      lap: min(splitRows.map((r) => r.lap)),
    }
  }, [splitRows])

  const isLoading = (dataA.isPending && driverA !== null) ||
    (dataB.isPending && driverB !== null) || (dataC.isPending && driverC !== null)
  const hasError = dataA.isError || dataB.isError || dataC.isError
  const noTelemetry =
    driverA !== null && lapNumber !== null && !dataA.isPending && !dataA.isError &&
    (dataA.data == null || dataA.data.length === 0)

  const resetBelow = () => { setDriverA(null); setDriverB(null); setDriverC(null); setLapNumber(null) }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SessionPicker
        year={year}
        meetingKey={meetingKey}
        sessionKey={sessionKey}
        onYear={(y) => { setYear(y); setMeetingKey(null); setSessionKey(null); resetBelow() }}
        onMeeting={(k) => { setMeetingKey(k); setSessionKey(null); resetBelow() }}
        onSession={(k) => { setSessionKey(k); resetBelow() }}
      />

      {/* Driver + lap selectors */}
      <div className="flex items-center gap-x-4 gap-y-1.5 px-4 py-2 bg-surface border-b border-panel flex-wrap">
        <DriverSelect label="Driver A" value={driverA} onChange={setDriverA}
          options={drivers.data ?? []} disabled={!sessionKey} placeholder="— select —" />
        <DriverSelect label="Driver B" value={driverB} onChange={setDriverB}
          options={(drivers.data ?? []).filter((d) => d.driver_number !== driverA && d.driver_number !== driverC)}
          disabled={!sessionKey} placeholder="(none)" />
        <DriverSelect label="Driver C" value={driverC} onChange={setDriverC}
          options={(drivers.data ?? []).filter((d) => d.driver_number !== driverA && d.driver_number !== driverB)}
          disabled={!sessionKey} placeholder="(none)" />

        <span className={LABEL}>Lap</span>
        <select value={lapNumber ?? ''} onChange={(e) => setLapNumber(Number(e.target.value) || null)}
          disabled={!driverA} className={SELECT}>
          <option value="">— select —</option>
          {availableLaps.map((n) => <option key={n} value={n}>Lap {n}</option>)}
        </select>

        <button
          onClick={() => setSmooth(smoothing ? '0' : '1')}
          className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition-colors ${
            smoothing ? 'bg-f1red text-white' : 'bg-panel text-muted hover:text-white'
          }`}
          title="Low-pass smoothing on speed/throttle/brake/RPM"
        >
          Smooth
        </button>

        {session && (
          <span className="text-muted text-xs">
            {session.circuit_short_name} · {session.session_name} · {session.year}
          </span>
        )}
        {isLoading && <span className="text-f1red text-xs animate-pulse">Loading telemetry…</span>}
      </div>

      {/* Charts */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {(() => {
          if (hasError) return <ErrorMessage message="Failed to load telemetry for a selected driver" />
          if (!driverA || !lapNumber) {
            return (
              <div className="flex items-center justify-center h-full text-muted text-sm">
                Select a session, driver, and lap to view telemetry
              </div>
            )
          }
          if (noTelemetry) {
            return (
              <div className="flex items-center justify-center h-full text-muted text-sm">
                No telemetry available for this lap — try another lap or driver
              </div>
            )
          }
          return (
            <>
              {/* Legend */}
              <div className="flex gap-5 text-xs mb-1 flex-wrap">
                {plotSlots.map((s) => (
                  <span key={s.num} className="flex items-center gap-1.5">
                    <span className="w-6 h-0.5 inline-block" style={{ background: s.color }} />
                    <span className="font-bold" style={{ color: s.color }}>{s.label}</span>
                  </span>
                ))}
                <span className="text-muted">Lap {lapNumber}</span>
              </div>

              <SplitsTable rows={splitRows} fastest={fastest} />

              <TelemetryChart title="Speed (km/h)" xData={xDist} yMin={0} yMax={380} height={130} series={series('speed', true)} />
              <TelemetryChart title="Throttle (%)" xData={xDist} yMin={0} yMax={100} height={80} series={series('throttle', true, true)} />
              <TelemetryChart title="Brake" xData={xDist} yMin={0} yMax={100} height={70} series={series('brake', true, true)} />
              <TelemetryChart title="Gear" xData={xDist} yMin={0} yMax={9} height={80} series={series('gear', false)} />
              <TelemetryChart title="RPM" xData={xDist} yMin={0} yMax={15000} height={90} series={series('rpm', true)} />

              {deltaSeries.length > 0 && (
                <div className={PANEL}>
                  <div className={PANEL_TITLE}>
                    Delta vs {acr(driverA, 'A')}
                    <span className="ml-2 font-normal text-muted normal-case tracking-normal">(+ = {acr(driverA, 'A')} ahead)</span>
                  </div>
                  <TelemetryChart title="" xData={xDist} height={90} series={deltaSeries} />
                </div>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}

function DriverSelect({
  label, value, onChange, options, disabled, placeholder,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  options: { driver_number: number; name_acronym: string; full_name: string }[]
  disabled: boolean
  placeholder: string
}) {
  return (
    <>
      <span className={LABEL}>{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(Number(e.target.value) || null)}
        disabled={disabled}
        className={SELECT}
      >
        <option value="">{placeholder}</option>
        {options.map((d) => (
          <option key={d.driver_number} value={d.driver_number}>
            {d.name_acronym} — {d.full_name}
          </option>
        ))}
      </select>
    </>
  )
}

interface SplitRow {
  num: number
  color: string
  acr: string
  s1: number | null
  s2: number | null
  s3: number | null
  lap: number | null
}

function SplitsTable({ rows, fastest }: { rows: SplitRow[]; fastest: { s1: number | null; s2: number | null; s3: number | null; lap: number | null } }) {
  if (rows.length === 0) return null
  const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(3))
  const cls = (v: number | null, best: number | null) =>
    v !== null && best !== null && v === best ? 'text-[#b48ead]' : 'text-white'
  return (
    <div className={PANEL}>
      <div className={PANEL_TITLE}>Sector splits</div>
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-[#636369]">
            <th className="text-left py-1 px-3">Driver</th>
            <th className="text-right py-1 px-3">S1</th>
            <th className="text-right py-1 px-3">S2</th>
            <th className="text-right py-1 px-3">S3</th>
            <th className="text-right py-1 px-3">Lap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.num} className="border-t border-[#2a2a35]">
              <td className="py-1 px-3">
                <span className="font-black" style={{ color: r.color }}>{r.acr}</span>
              </td>
              <td className={`text-right py-1 px-3 tabular-nums ${cls(r.s1, fastest.s1)}`}>{fmt(r.s1)}</td>
              <td className={`text-right py-1 px-3 tabular-nums ${cls(r.s2, fastest.s2)}`}>{fmt(r.s2)}</td>
              <td className={`text-right py-1 px-3 tabular-nums ${cls(r.s3, fastest.s3)}`}>{fmt(r.s3)}</td>
              <td className={`text-right py-1 px-3 tabular-nums font-bold ${cls(r.lap, fastest.lap)}`}>{fmt(r.lap)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
