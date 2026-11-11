import { Component, type ReactNode } from 'react';
import { t, useUILang } from '../i18n';

function ErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const lang = useUILang();
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-left">
      <div className="bg-cw-negative-soft border border-cw-negative/30 rounded-lg p-6 max-w-2xl w-full">
        <h2 className="text-sm font-bold text-cw-negative mb-2">{t('renderError', lang)}</h2>
        <pre className="text-xs text-cw-negative whitespace-pre-wrap break-all font-mono bg-cw-negative-soft rounded p-3 max-h-64 overflow-auto">
          {error.message}
          {'\n\n'}
          {error.stack}
        </pre>
        <button
          className="mt-4 px-4 py-2 text-sm bg-cw-negative text-white rounded hover:bg-cw-negative"
          onClick={onRetry}
        >
          {t('retry', lang)}
        </button>
      </div>
    </div>
  );
}

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

    return <ErrorFallback error={error} onRetry={() => this.setState({ error: null })} />;
  }
}
