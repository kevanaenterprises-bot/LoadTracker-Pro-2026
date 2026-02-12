import React from 'react';
import DriverPortalView from '@/components/tms/DriverPortalView';

// Error boundary to prevent blank white page on crash
class DriverPortalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Driver Portal crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
            textAlign: 'center',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              background: '#fef2f2',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: '24px',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 20px', lineHeight: 1.5 }}>
              The Driver Portal encountered an error. This can sometimes happen after changing browser settings.
            </p>
            {this.state.error && (
              <p style={{
                fontSize: '11px',
                color: '#94a3b8',
                background: '#f8fafc',
                padding: '8px 12px',
                borderRadius: '8px',
                margin: '0 0 20px',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                textAlign: 'left',
              }}>
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                width: '100%',
                padding: '14px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
                marginBottom: '10px',
              }}
            >
              Reload Page
            </button>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
              }}
              style={{
                width: '100%',
                padding: '12px',
                background: 'transparent',
                color: '#3b82f6',
                border: '2px solid #e2e8f0',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try Again Without Reloading
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const DriverPortalPage: React.FC = () => {
  return (
    <DriverPortalErrorBoundary>
      <DriverPortalView onBack={() => { window.location.href = '/driver-portal'; }} />
    </DriverPortalErrorBoundary>
  );
};

export default DriverPortalPage;
