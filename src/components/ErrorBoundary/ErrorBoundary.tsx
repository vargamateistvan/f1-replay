import { Component, type ReactNode } from "react";
import AppCrash from "@/pages/AppCrash";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  private readonly handleGoHome = () => {
    if (globalThis.window !== undefined) {
      globalThis.window.history.replaceState(null, "", "/");
    }
    this.setState({ error: null });
  };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <AppCrash
          message={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
          onGoHome={this.handleGoHome}
        />
      );
    }
    return this.props.children;
  }
}
