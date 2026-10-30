import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { OpenF1Error } from "@/api/client";
import { LiveDataNotice, QueryLiveDataNotice } from "./LiveDataNotice";
import { resetLiveDataNoticeDismissal } from "./dismissal";

describe("LiveDataNotice", () => {
  beforeEach(() => {
    resetLiveDataNoticeDismissal();
  });

  it("explains how to support live data after an unauthorized response", () => {
    render(<LiveDataNotice error={new OpenF1Error(401, "position")} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Live data is currently unavailable",
    );
    expect(
      screen.getByRole("link", { name: /support f1 replay/i }),
    ).toHaveAttribute("href", "https://buymeacoffee.com/matt_varga");
    expect(screen.getByRole("link", { name: "OpenF1" })).toHaveAttribute(
      "href",
      "https://openf1.org/",
    );
  });

  it("stays hidden for non-authentication errors", () => {
    const { container } = render(
      <LiveDataNotice error={new OpenF1Error(500, "position")} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders one shared notice for multiple denied active queries and clears when recovered", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const observers = ["drivers", "positions"].map((key) => new QueryObserver(client, {
      queryKey: [key, 123],
      queryFn: async () => { throw new OpenF1Error(401, key); },
    }));
    const unsubscribes = observers.map((observer) => observer.subscribe(() => {}));
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <QueryLiveDataNotice />
      </QueryClientProvider>,
    );
    try {
      await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(1));
      act(() => {
        client.setQueryData(["drivers", 123], []);
        client.setQueryData(["positions", 123], []);
      });
      await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    } finally {
      unmount();
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      client.clear();
    }
  });

  it("can be dismissed, hiding every instance without persisting to storage", () => {
    const error = new OpenF1Error(403, "position");
    render(
      <>
        <LiveDataNotice error={error} />
        <LiveDataNotice error={error} />
      </>,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(2);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Dismiss live data notice" })[0],
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });
});
