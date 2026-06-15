// Starting lights sequence: 5 red lights illuminate 1 s apart in the 5 s
// before lights out, then go dark simultaneously when the race starts.

const LIGHT_COUNT = 5;
const SEQUENCE_MS = LIGHT_COUNT * 1_000; // 5 000 ms total
const SHOW_BUFFER_MS = 700;              // housing appears this long before first light

interface Props {
  /** Current playhead position, session-relative ms (~10 Hz from useCoarseTime). */
  t: number;
  /** Session-relative ms when all lights go out (= race start, derived from lap 1). */
  lightsOutMs: number;
}

export function StartingLights({ t, lightsOutMs }: Props) {
  // phase < 0  → before lights out   phase ≥ 0 → lights out / race started
  const phase = t - lightsOutMs;

  // Only visible during the run-up to lights out
  if (phase < -(SEQUENCE_MS + SHOW_BUFFER_MS) || phase >= 0) return null;

  // Number of lit lights: light i turns on at phase = -(SEQUENCE_MS - i * 1000)
  // formula: floor((phase + SEQUENCE_MS) / 1000) + 1, clamped [0, LIGHT_COUNT]
  const lit = Math.max(0, Math.min(LIGHT_COUNT,
    Math.floor((phase + SEQUENCE_MS) / 1_000) + 1,
  ));

  return (
    <div className="absolute inset-x-0 top-0 flex justify-center z-50 pointer-events-none">
      <div
        className="flex flex-col items-center mt-3 sm:mt-4"
        style={{
          background: 'linear-gradient(180deg, #0c0c18 0%, #111120 100%)',
          border: '1px solid #282838',
          boxShadow: '0 8px 40px rgba(0,0,0,0.85)',
          borderRadius: 3,
          padding: '10px 20px 14px',
        }}
      >
        {/* Gantry top bar */}
        <div
          className="w-full mb-3 rounded-sm"
          style={{ height: 3, background: '#222232' }}
        />

        {/* Five lights */}
        <div className="flex gap-3 sm:gap-4">
          {Array.from({ length: LIGHT_COUNT }, (_, i) => {
            const on = i < lit;
            return (
              <div
                key={i}
                style={{
                  // Outer housing recess
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: on ? '#e8002d' : '#130505',
                  border: `2px solid ${on ? '#ff2244' : '#1e0808'}`,
                  boxShadow: on
                    ? '0 0 10px 4px rgba(232,0,45,0.65), 0 0 28px 10px rgba(232,0,45,0.25), inset 0 2px 0 rgba(255,100,100,0.35)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                  // Snap transition — lights don't fade on, they snap
                  transition: on ? 'none' : 'background 0.08s, box-shadow 0.08s, border-color 0.08s',
                }}
              />
            );
          })}
        </div>

        {/* Countdown hint */}
        <div
          className="mt-2.5 text-[9px] font-black uppercase tracking-[0.25em]"
          style={{ color: '#444460' }}
        >
          {lit === 0 ? 'GET READY' : lit < LIGHT_COUNT ? `${LIGHT_COUNT - lit}` : 'LIGHTS OUT'}
        </div>
      </div>
    </div>
  );
}
