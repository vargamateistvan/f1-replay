import { Component, type ReactNode } from "react";
import AppCrash from "@/pages/AppCrash";
import {
  handleStaleChunkError,
  isReloadingForStaleChunk,
  isStaleChunkError,
} from "@/lib/staleChunkReload";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
  reloading: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloading: false };

  private readonly handleGoHome = () => {
    if (globalThis.window !== undefined) {
      globalThis.window.history.replaceState(null, "", "/");
    }
    this.setState({ error: null, reloading: false });
  };

  static getDerivedStateFromError(error: Error): State {
    // A new deploy removed this chunk; the page is already reloading.
    const reloading = isStaleChunkError(error) && isReloadingForStaleChunk();
    return { error, reloading };
  }

  componentDidCatch(error: Error) {
    // Fallback for chunk failures Vite didn't report via vite:preloadError.
    if (!this.state.reloading && handleStaleChunkError(error)) {
      this.setState({ reloading: true });
    }
  }

  render() {
    if (this.state.reloading) {
      return (
        <div
          role="status"
          className="flex min-h-[100dvh] items-center justify-center bg-track text-xs uppercase tracking-[0.12em] text-muted"
        >
          Loading the latest version…
        </div>
      );
    }
    if (this.state.error) {
      return (
        <AppCrash
          message={this.state.error.message}
          onRetry={() => this.setState({ error: null, reloading: false })}
          onGoHome={this.handleGoHome}
        />
      );
    }
    return this.props.children;
  }
}
