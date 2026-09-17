import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./theme.core.css";
import "./styles.css";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("LabMotion render error", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-boundary">
          <h1>Algo salió mal</h1>
          <p>Recarga la página para continuar.</p>
          <button type="button" onClick={() => window.location.reload()}>Recargar</button>
        </main>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el elemento root");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
