"use client";

import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (process.env.NODE_ENV !== "production") {
      // Only log in dev — production should send errors to an error-reporting
      // service (e.g. Sentry) rather than leak stack traces to the browser console.
      console.error("ErrorBoundary caught an error:", error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-container" style={{ padding: "2rem", textAlign: "center" }}>
          <h2>Something went wrong.</h2>
          <p>{this.state.error?.message || "An unexpected error occurred."}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "0.5rem 1rem",
              background: "var(--brand)",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              marginTop: "1rem"
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
