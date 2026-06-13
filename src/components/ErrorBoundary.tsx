import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-4 bg-track text-center px-6">
          <div className="text-f1red text-4xl font-black tracking-widest">F1 REPLAY</div>
          <div className="text-red-400 text-sm font-mono max-w-md">
            Something crashed: {this.state.error.message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-f1red text-white text-sm font-bold rounded hover:bg-red-600 transition-colors"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
