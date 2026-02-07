import { StrictMode, useState, useEffect, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DemoProvider } from './contexts/DemoContext'
import { PrivacyPolicy } from './pages/PrivacyPolicy'
import { TermsOfService } from './pages/TermsOfService'

// Error Boundary for catching render errors
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          backgroundColor: '#0D0D0D',
          color: 'white',
          minHeight: '100vh',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <h1 style={{ color: '#FF6B6B' }}>Something went wrong</h1>
          <p>Please refresh the page or try again later.</p>
          <details style={{ marginTop: '20px', color: '#888' }}>
            <summary>Error details</summary>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {this.state.error?.toString()}
            </pre>
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              backgroundColor: '#14F195',
              color: '#0D0D0D',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Simple path-based router
function Router() {
  const [route, setRoute] = useState(window.location.pathname);

  useEffect(() => {
    const handleRouteChange = () => {
      setRoute(window.location.pathname);
    };

    window.addEventListener('popstate', handleRouteChange);

    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  // Route matching - support both root and base path
  const base = import.meta.env.BASE_URL || '/';
  const normalizedRoute = route.startsWith(base) ? route.slice(base.length - 1) : route;

  switch (normalizedRoute) {
    case '/privacy':
    case '/privacy-policy':
      return <PrivacyPolicy />;
    case '/terms':
    case '/terms-of-service':
      return <TermsOfService />;
    default:
      return (
        <DemoProvider>
          <App />
        </DemoProvider>
      );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Router />
    </ErrorBoundary>
  </StrictMode>,
)
