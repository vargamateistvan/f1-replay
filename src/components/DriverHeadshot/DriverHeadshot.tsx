import { useEffect, useState } from "react";
import type { Driver } from "@/api/types";
import { toSafeExternalUrl } from "@/utils/url";

interface Props {
  readonly driver: Driver | undefined;
  readonly accent: string;
  readonly size?: "xxs" | "xs" | "sm" | "md" | "lg";
}

const SIZE_CLASSES: Record<NonNullable<Props["size"]>, string> = {
  xxs: "h-4 w-4 text-[7px]",
  xs: "h-5 w-5 text-[8px]",
  sm: "h-7 w-7 text-[9px]",
  md: "h-10 w-10 text-[11px]",
  lg: "h-14 w-14 text-sm",
};

function fallbackLabel(driver: Driver | undefined): string {
  if (!driver) return "--";
  return driver.name_acronym || String(driver.driver_number);
}

export function DriverHeadshot({ driver, accent, size = "md" }: Props) {
  const [failed, setFailed] = useState(false);
  const safeHeadshotUrl = toSafeExternalUrl(driver?.headshot_url);

  useEffect(() => {
    setFailed(false);
  }, [safeHeadshotUrl]);

  const className = `${SIZE_CLASSES[size]} shrink-0 overflow-hidden rounded-full border bg-[#161922]`;

  if (!safeHeadshotUrl || failed) {
    return (
      <span
        className={`${className} flex items-center justify-center font-black uppercase tracking-[0.08em] text-white`}
        style={{ borderColor: accent }}
        aria-hidden="true"
      >
        {fallbackLabel(driver)}
      </span>
    );
  }

  return (
    <img
      src={safeHeadshotUrl}
      alt={driver?.full_name ?? "Driver headshot"}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${className} object-cover`}
      style={{ borderColor: accent }}
    />
  );
}
