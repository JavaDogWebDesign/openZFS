import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "var(--color-bg)",
          color: "var(--color-text)",
          padding: "var(--space-6)",
          textAlign: "center",
        }}>
          <h1 style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-3)" }}>Something went wrong</h1>
          <p style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-4)", maxWidth: 500 }}>
            An unexpected error occurred. Try refreshing the page.
          </p>
          <pre style={{
            background: "var(--color-bg-surface)",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-xs)",
            maxWidth: 600,
            overflow: "auto",
            color: "var(--color-danger)",
          }}>
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "var(--space-4)",
              padding: "var(--space-2) var(--space-4)",
              background: "var(--color-accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
