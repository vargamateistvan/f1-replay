import { Suspense, type ReactNode } from "react";
import { PanelFallback } from "./PanelFallback";

interface TrackerPanelFrameProps {
  children: ReactNode;
  mobile?: boolean;
}

export function TrackerPanelFrame({
  children,
  mobile = false,
}: Readonly<TrackerPanelFrameProps>) {
  const content = <Suspense fallback={<PanelFallback />}>{children}</Suspense>;

  if (mobile) {
    return <div className="h-[52vh] min-h-[280px] bg-[#10101a]">{content}</div>;
  }

  return content;
}
