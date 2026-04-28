import { Component } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

// =============================================================================
// ErrorBoundary — Captura erros de render para exibir fallback em vez de tela
// em branco. Necessário porque hooks (try/catch) não capturam erros no ciclo
// de renderização do React (ex.: "Objects are not valid as a React child").
// =============================================================================

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Render error caught:", error, info.componentStack);
  }

  reset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 p-8">
        <div className="w-14 h-14 rounded-2xl bg-neon-red/10 border border-neon-red/30
                        flex items-center justify-center">
          <AlertCircle size={26} className="text-neon-red" />
        </div>
        <div className="text-center space-y-1.5 max-w-md">
          <p className="text-white font-semibold">Erro ao renderizar esta página</p>
          <p className="text-slate-500 text-sm">
            Ocorreu um erro inesperado. Isso geralmente é causado por dados inválidos
            vindos da API.
          </p>
          <p className="text-[10px] font-mono text-slate-700 mt-2 break-all">
            {this.state.error?.message ?? "Erro desconhecido"}
          </p>
        </div>
        <button
          onClick={() => this.reset()}
          className="btn-ghost flex items-center gap-1.5 text-sm"
        >
          <RefreshCw size={13} />
          Tentar novamente
        </button>
      </div>
    );
  }
}
