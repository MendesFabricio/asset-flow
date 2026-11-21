'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[React ErrorBoundary] Erro de renderização interceptado:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-6 my-4 bg-status-error/10 border border-status-error/30 rounded-xl text-center flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-status-error/15 text-status-error flex items-center justify-center">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">Não foi possível carregar este bloco</h3>
            <p className="text-xs text-text-muted mt-1 max-w-md">
              {this.state.error?.message || 'Ocorreu uma falha inesperada na interface.'}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="mt-2 bg-surface-input hover:bg-surface-elevated text-text-primary text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2 border border-border-subtle transition-colors duration-150 active:scale-[0.98]"
          >
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
