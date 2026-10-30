// Shared by the race/telemetry session picker in Nav and the driver/team
// profile pickers so every page's picker bar looks the same.

export const PICKER_BAR =
  "border-b border-panel bg-sunken";

export const PICKER_SELECT =
  "w-full max-sm:h-7 bg-surface text-fg border border-panel rounded-sm text-small font-medium pl-2 pr-6 py-1 focus:outline-none focus:ring-1 focus:ring-f1red/70 focus:border-f1red/70 appearance-none cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed [&>option]:bg-surface [&>option]:text-fg";

export const PICKER_FIELD_LABEL =
  "text-tiny font-bold uppercase tracking-widest text-muted leading-none";

export const PICKER_CHEVRON =
  "pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted";
