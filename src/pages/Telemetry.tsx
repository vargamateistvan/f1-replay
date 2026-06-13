export default function Telemetry() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted gap-3">
      <div className="text-4xl">📊</div>
      <div className="text-xl font-bold text-white">Telemetry</div>
      <div className="text-sm text-center max-w-sm">
        Driver-vs-driver telemetry comparison — speed, throttle, brake, gear, DRS on a shared distance axis.
        Coming in Phase 6.
      </div>
    </div>
  )
}
