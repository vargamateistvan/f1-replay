// Shared by the race/telemetry session picker in Nav and the Standings year
// picker so every page's picker bar looks the same.

export const PICKER_BAR =
  "border-b border-panel bg-[linear-gradient(180deg,#11131b,#0f1118)] light:!bg-white light:!bg-none light:border-slate-300/80";

export const PICKER_SELECT =
  "w-full max-sm:h-7 bg-surface text-white border border-panel rounded-sm text-[11px] font-medium pl-2 pr-6 py-1 focus:outline-none focus:ring-1 focus:ring-f1red/70 focus:border-f1red/70 appearance-none cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed [&>option]:bg-surface [&>option]:text-white light:bg-white light:text-black light:border-slate-300 light:focus:border-slate-500 light:[color-scheme:light] light:[&>option]:bg-white light:[&>option]:text-black";

export const PICKER_FIELD_LABEL =
  "text-[9px] font-bold uppercase tracking-widest text-muted leading-none";

export const PICKER_CHEVRON =
  "pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted";
