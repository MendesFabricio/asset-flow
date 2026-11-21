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
    console.error('💥 [React ErrorBoundary] Erro de renderização interceptado:', error, errorInfo);
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
        <div className="p-6 my-4 bg-red-950/20 border border-red-900/40 rounded-2xl text-center flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-900/30 text-red-400 flex items-center justify-center">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Ops! Algo deu errado ao carregar este bloco</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              {this.state.error?.message || 'Ocorreu uma falha inesperada na interface.'}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="mt-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2 border border-slate-700 transition-all active:scale-95"
          >
            <RefreshCw size={14} /> Tentar Novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
