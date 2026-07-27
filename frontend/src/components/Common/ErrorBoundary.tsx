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
        <div style={{
          padding: '40px',
          fontFamily: 'sans-serif',
          maxWidth: '800px',
          margin: '0 auto',
          color: '#f0f0f0',
          backgroundColor: '#242424',
          minHeight: '100vh'
        }}>
          <h1 style={{ color: '#f44336' }}>Arcane Familiars — Render Error</h1>
          <pre style={{
            background: '#1a1a1a',
            padding: '20px',
            borderRadius: '8px',
            overflow: 'auto',
            fontSize: '14px',
            color: '#ff9800'
          }}>{this.state.error?.message}</pre>
          <pre style={{
            background: '#1a1a1a',
            padding: '20px',
            borderRadius: '8px',
            overflow: 'auto',
            fontSize: '12px',
            color: '#9e9e9e',
            marginTop: '16px'
          }}>{this.state.error?.stack}</pre>
          <p style={{ marginTop: '24px', color: '#888' }}>
            Check the browser console (F12) for more details.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
