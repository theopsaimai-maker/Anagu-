import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error?.message || 'An unexpected application error occurred.';
    try {
      const parsed = JSON.parse(readable) as { error?: string; operationType?: string; path?: string };
      if (parsed && typeof parsed === 'object' && parsed.error) {
        readable = `${parsed.error}${parsed.path ? ` (${parsed.operationType || 'access'} ${parsed.path})` : ''}`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message: readable };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught error:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#060911] text-slate-100 flex items-center justify-center p-4 font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-red-500/40 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Registry Session Interrupted</h2>
                <p className="text-xs text-slate-400">Recoverable application error</p>
              </div>
            </div>

            <div className="text-xs text-red-200 bg-red-950/40 border border-red-800/60 rounded-xl p-3 break-words">
              {this.state.message}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, message: '' });
                  window.location.reload();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Portal</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
