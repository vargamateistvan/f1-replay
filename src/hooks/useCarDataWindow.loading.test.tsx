import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/endpoints";
import { useCarDataWindow } from "./useCarDataWindow";
import { useCarDataForLap } from "./useCarDataForLap";

describe("focused telemetry startup gate", () => {
  beforeEach(() => {
    vi.spyOn(api, "carDataForDriver").mockResolvedValue([]);
    vi.spyOn(api, "carDataWindowAll").mockResolvedValue([]);
    vi.spyOn(api, "laps").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([false, true])("defers focused telemetry, including shared=%s windows and lap data", async (shared) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    const { result, rerender, unmount } = renderHook(({ enabled }) => ({
      window: useCarDataWindow(123, 44, 1000, 5, {
        enabled, sharedAllDriverWindow: shared,
      }),
      lap: useCarDataForLap(123, 44, 5, { enabled }),
    }), { initialProps: { enabled: false }, wrapper });
    expect(api.carDataForDriver).not.toHaveBeenCalled();
    expect(api.carDataWindowAll).not.toHaveBeenCalled();
    expect(api.laps).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => {
      expect(result.current.window.isPending).toBe(false);
      expect(result.current.lap.isSuccess).toBe(true);
    });
    expect(shared ? api.carDataWindowAll : api.carDataForDriver).toHaveBeenCalledTimes(2);
    expect(shared ? api.carDataForDriver : api.carDataWindowAll).not.toHaveBeenCalled();
    expect(api.laps).toHaveBeenCalledWith(123);
    expect(client.getQueryData(["carDataForLap", 123, 44, 5])).toBeNull();
    unmount();
    client.clear();
  });
});
