import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-left">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-2xl w-full">
          <h2 className="text-sm font-bold text-red-700 mb-2">Renderingsfeil</h2>
          <pre className="text-xs text-red-600 whitespace-pre-wrap break-all font-mono bg-red-100 rounded p-3 max-h-64 overflow-auto">
            {error.message}
            {'\n\n'}
            {error.stack}
          </pre>
          <button
            className="mt-4 px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
            onClick={() => this.setState({ error: null })}
          >
            Prøv igjen
          </button>
        </div>
      </div>
    );
  }
}
