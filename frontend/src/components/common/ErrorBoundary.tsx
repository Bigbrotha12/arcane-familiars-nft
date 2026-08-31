import { Component, ReactNode, ErrorInfo } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface-primary p-xl font-body" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h1 className="text-2xl font-display font-semibold mb-md" style={{ color: 'var(--error)' }}>
            Arcane Familiars — Render Error
          </h1>
          <pre
            className="p-lg rounded-md overflow-auto text-sm mb-md"
            style={{ background: 'var(--bg-secondary)', color: 'var(--warning)' }}
          >
            {this.state.error?.message}
          </pre>
          <pre
            className="p-lg rounded-md overflow-auto text-xs"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
          >
            {this.state.error?.stack}
          </pre>
          <p className="mt-lg" style={{ color: 'var(--text-muted)' }}>
            Check the browser console (F12) for more details.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
