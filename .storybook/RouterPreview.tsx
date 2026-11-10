import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

export function RouterPreview({ children }: { children: ReactNode }) {
  return <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {children}
  </MemoryRouter>;
}
