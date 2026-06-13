import { useMemo } from 'react'
import { SessionPicker } from '@/components/SessionPicker'
import { TelemetryChart } from '@/components/TelemetryChart/TelemetryChart'
import { ErrorMessage } from '@/components/ErrorMessage'
import { useDrivers, useLaps, useSessions } from '@/hooks/useSession'
import { useCarDataForLap, type TelemetrySample } from '@/hooks/useCarDataForLap'
import { useNumberParam } from '@/hooks/useSearchParamState'
import { teamColor } from '@/utils/color'
import { DEFAULT_YEAR } from '@/constants'

// Resample driver B's data onto driver A's distance axis via linear interpolation
function resampleToAxis(
  ref: TelemetrySample[],
  other: TelemetrySample[],
): TelemetrySample[] {
  if (other.length === 0) return []
  const maxDist = other[other.length - 1]!.distM
  return ref.map((r) => {
    const d = Math.min(r.distM, maxDist)
    // find bracketing indices in `other`
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

// Compute delta time: how many seconds driver A is ahead of driver B at each distance point
function computeDelta(a: TelemetrySample[], bResampled: TelemetrySample[]): number[] {
  return a.map((s, i) => s.timeS - (bResampled[i]?.timeS ?? s.timeS))
}

const PANEL = 'bg-surface border border-panel'
const PANEL_TITLE = 'text-[10px] font-bold text-muted px-3 py-2 border-b border-[#38383f] uppercase tracking-[0.12em] border-l-2 border-l-f1red bg-track'
const LABEL = 'text-[10px] font-bold uppercase tracking-widest text-muted'

export default function Telemetry() {
  const [yearParam, setYear] = useNumberParam('year', DEFAULT_YEAR)
  const year = yearParam ?? DEFAULT_YEAR
  const [meetingKey, setMeetingKey] = useNumberParam('meeting', null)
  const [sessionKey, setSessionKey] = useNumberParam('session', null)
  const [driverA, setDriverA] = useNumberParam('a', null)
  const [driverB, setDriverB] = useNumberParam('b', null)
  const [lapNumber, setLapNumber] = useNumberParam('lap', null)

  const sessions = useSessions(meetingKey)
  const drivers = useDrivers(sessionKey)
  const laps = useLaps(sessionKey, driverA ?? undefined)

  const dataA = useCarDataForLap(sessionKey, driverA, lapNumber)
  const dataB = useCarDataForLap(sessionKey, driverB, lapNumber)

  const session = sessions.data?.find((s) => s.session_key === sessionKey)

  // Available laps for driver A (deduplicated, sorted)
  const availableLaps = useMemo(() => {
    if (!laps.data) return []
    return [...new Set(laps.data.map((l) => l.lap_number))].sort((a, b) => a - b)
  }, [laps.data])

  // Resample driver B onto driver A's distance axis for comparison
  const dataBResampled = useMemo(() => {
    if (!dataA.data || !dataB.data) return null
    return resampleToAxis(dataA.data, dataB.data)
  }, [dataA.data, dataB.data])

  const delta = useMemo(() => {
    if (!dataA.data || !dataBResampled) return null
    return computeDelta(dataA.data, dataBResampled)
  }, [dataA.data, dataBResampled])

  // Shared x axis (distance in metres from driver A)
  const xDist = useMemo(() => dataA.data?.map((s) => s.distM) ?? [], [dataA.data])

  const driverByNumber = useMemo(
    () => new Map((drivers.data ?? []).map((d) => [d.driver_number, d])),
    [drivers.data],
  )

  function makeSeries(
    key: keyof Omit<TelemetrySample, 'distM' | 'timeS'>,
    label: string,
    data: TelemetrySample[] | null | undefined,
    color: string,
    fill?: string,
  ) {
    return { label, color, fill, data: data?.map((s) => s[key] as number) ?? [] }
  }

  const colorA = teamColor(driverByNumber.get(driverA ?? -1)?.team_colour, '#e8002d')
  const colorB = teamColor(driverByNumber.get(driverB ?? -1)?.team_colour, '#0067ff')

  const isLoadingA = dataA.isPending && driverA !== null && lapNumber !== null
  const isLoadingB = dataB.isPending && driverB !== null && lapNumber !== null

  const hasError = dataA.isError || dataB.isError
  // Lap + driver chosen and the fetch settled, but no telemetry came back for it
  // (sparse/old session, or a lap with no car_data window).
  const noTelemetry =
    driverA !== null && lapNumber !== null && !isLoadingA && !dataA.isError &&
    (dataA.data == null || dataA.data.length === 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Session picker */}
      <SessionPicker
        year={year}
        meetingKey={meetingKey}
        sessionKey={sessionKey}
        onYear={(y) => { setYear(y); setMeetingKey(null); setSessionKey(null); setDriverA(null); setDriverB(null); setLapNumber(null) }}
        onMeeting={(k) => { setMeetingKey(k); setSessionKey(null); setDriverA(null); setDriverB(null); setLapNumber(null) }}
        onSession={(k) => { setSessionKey(k); setDriverA(null); setDriverB(null); setLapNumber(null) }}
      />

      {/* Driver + lap selectors */}
      <div className="flex items-center gap-x-4 gap-y-1.5 px-4 py-2 bg-surface border-b border-panel flex-wrap">
        <span className={LABEL}>Driver A</span>
        <select
          value={driverA ?? ''}
          onChange={(e) => { setDriverA(Number(e.target.value) || null); setLapNumber(null) }}
          disabled={!sessionKey}
          className="bg-panel text-white border border-[#38383f] text-xs font-medium px-3 py-1.5 focus:outline-none"
        >
          <option value="">— select —</option>
          {drivers.data?.map((d) => (
            <option key={d.driver_number} value={d.driver_number}>
              {d.name_acronym} — {d.full_name}
            </option>
          ))}
        </select>

        <span className={LABEL}>Driver B</span>
        <select
          value={driverB ?? ''}
          onChange={(e) => setDriverB(Number(e.target.value) || null)}
          disabled={!sessionKey}
          className="bg-panel text-white border border-[#38383f] text-xs font-medium px-3 py-1.5 focus:outline-none"
        >
          <option value="">(none)</option>
          {drivers.data?.filter((d) => d.driver_number !== driverA).map((d) => (
            <option key={d.driver_number} value={d.driver_number}>
              {d.name_acronym} — {d.full_name}
            </option>
          ))}
        </select>

        <span className={LABEL}>Lap</span>
        <select
          value={lapNumber ?? ''}
          onChange={(e) => setLapNumber(Number(e.target.value) || null)}
          disabled={!driverA}
          className="bg-panel text-white border border-[#38383f] text-xs font-medium px-3 py-1.5 focus:outline-none"
        >
          <option value="">— select —</option>
          {availableLaps.map((n) => (
            <option key={n} value={n}>Lap {n}</option>
          ))}
        </select>

        {session && (
          <span className="text-muted text-xs">
            {session.circuit_short_name} · {session.session_name} · {session.year}
          </span>
        )}

        {(isLoadingA || isLoadingB) && (
          <span className="text-f1red text-xs animate-pulse">Loading telemetry…</span>
        )}
      </div>

      {/* Charts */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {hasError ? (
          <ErrorMessage
            message={
              dataA.isError && dataB.isError
                ? 'Failed to load telemetry for both drivers'
                : dataA.isError
                ? 'Failed to load telemetry for Driver A'
                : 'Failed to load telemetry for Driver B'
            }
          />
        ) : !driverA || !lapNumber ? (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            Select a session, driver, and lap to view telemetry
          </div>
        ) : noTelemetry ? (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            No telemetry available for this lap — try another lap or driver
          </div>
        ) : (
          <>
            {/* Driver legend */}
            <div className="flex gap-6 text-xs font-mono mb-1">
              <span className="flex items-center gap-1.5">
                <span className="w-6 h-0.5 inline-block rounded" style={{ background: colorA }} />
                <span style={{ color: colorA }}>
                  {driverByNumber.get(driverA)?.name_acronym ?? driverA}
                  {lapNumber && ` — Lap ${lapNumber}`}
                </span>
              </span>
              {driverB && (
                <span className="flex items-center gap-1.5">
                  <span className="w-6 h-0.5 inline-block rounded" style={{ background: colorB }} />
                  <span style={{ color: colorB }}>
                    {driverByNumber.get(driverB)?.name_acronym ?? driverB}
                  </span>
                </span>
              )}
            </div>

            {/* Speed */}
            <TelemetryChart
              title="Speed (km/h)"
              xData={xDist}
              yMin={0} yMax={380}
              height={130}
              series={[
                makeSeries('speed', driverByNumber.get(driverA)?.name_acronym ?? 'A', dataA.data, colorA),
                ...(driverB && dataBResampled ? [makeSeries('speed', driverByNumber.get(driverB)?.name_acronym ?? 'B', dataBResampled, colorB)] : []),
              ]}
            />

            {/* Throttle */}
            <TelemetryChart
              title="Throttle (%)"
              xData={xDist}
              yMin={0} yMax={100}
              height={80}
              series={[
                makeSeries('throttle', 'Throttle A', dataA.data, colorA, `${colorA}33`),
                ...(driverB && dataBResampled ? [makeSeries('throttle', 'Throttle B', dataBResampled, colorB, `${colorB}33`)] : []),
              ]}
            />

            {/* Brake */}
            <TelemetryChart
              title="Brake"
              xData={xDist}
              yMin={0} yMax={100}
              height={70}
              series={[
                makeSeries('brake', 'Brake A', dataA.data, '#ef4444', '#ef444433'),
                ...(driverB && dataBResampled ? [makeSeries('brake', 'Brake B', dataBResampled, '#f97316', '#f9731633')] : []),
              ]}
            />

            {/* Gear */}
            <TelemetryChart
              title="Gear"
              xData={xDist}
              yMin={0} yMax={9}
              height={80}
              series={[
                makeSeries('gear', 'Gear A', dataA.data, colorA),
                ...(driverB && dataBResampled ? [makeSeries('gear', 'Gear B', dataBResampled, colorB)] : []),
              ]}
            />

            {/* RPM */}
            <TelemetryChart
              title="RPM"
              xData={xDist}
              yMin={0} yMax={15000}
              height={90}
              series={[
                makeSeries('rpm', 'RPM A', dataA.data, colorA),
                ...(driverB && dataBResampled ? [makeSeries('rpm', 'RPM B', dataBResampled, colorB)] : []),
              ]}
            />

            {/* Delta time — only when two drivers selected */}
            {driverB && delta && (
              <div className={PANEL}>
                <div className={PANEL_TITLE}>
                  Delta — {driverByNumber.get(driverA)?.name_acronym} vs {driverByNumber.get(driverB)?.name_acronym}
                  <span className="ml-2 font-normal text-muted">(+ = A ahead)</span>
                </div>
                <TelemetryChart
                  title=""
                  xData={xDist}
                  height={90}
                  series={[{
                    label: 'Δ time (s)',
                    color: '#a78bfa',
                    fill: '#a78bfa22',
                    data: delta,
                  }]}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
