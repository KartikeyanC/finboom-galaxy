import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  /**
   * Optional reporter hook. Wire this to Sentry (or equivalent) once an error
   * reporting service is approved — the boundary deliberately has no hard
   * dependency on one, so it works standalone.
   */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors anywhere below it and shows a recoverable
 * screen instead of React unmounting the whole tree to a blank white page.
 *
 * Note: error boundaries do NOT catch errors in event handlers, async code,
 * or during SSR — those still need local try/catch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Always leave a breadcrumb in the console, even without a reporter.
    console.error("Unhandled render error:", error, info.componentStack);
    this.props.onError?.(error, info);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleHome = () => {
    // Full navigation, not react-router: the router itself may be the thing
    // that threw, so we cannot rely on it still working.
    window.location.assign("/app");
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isDev = import.meta.env.DEV;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
              <p className="text-sm text-muted-foreground">
                This screen failed to load. Your data is safe.
              </p>
            </div>
          </div>

          {isDev && (
            <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={this.handleReset} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
            <Button variant="outline" onClick={this.handleReload} className="gap-2">
              Reload page
            </Button>
            <Button variant="ghost" onClick={this.handleHome} className="gap-2">
              <Home className="h-4 w-4" />
              Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
