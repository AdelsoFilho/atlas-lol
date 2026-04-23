// =============================================================================
// SearchBar — Busca com histórico persistente e autocompletar
// • Histórico de até 8 pesquisas no localStorage (via useSearchHistory)
// • Dropdown "Recentes" ao focar o campo vazio
// • Filtro dinâmico de histórico enquanto o usuário digita
// • Debounce 300 ms: tenta buscar na API ao digitar um Riot ID completo (Name#TAG)
// • Teclas: Enter = busca, Esc = fecha dropdown, ↑↓ = navega sugestões
// =============================================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Clock, X, Loader2, ChevronRight, Trash2 } from "lucide-react";
import { useSearchHistory } from "../hooks/useSearchHistory";

// ── Utilitários ───────────────────────────────────────────────────────────────

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

function formatRelTime(ts) {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)   return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ── Sugestão individual no dropdown ──────────────────────────────────────────

function HistoryItem({ entry, isActive, onSelect, onRemove }) {
  const wr = entry.winrate ?? null;
  const wrColor = wr == null ? "text-gray-600"
    : wr >= 60 ? "text-emerald-400"
    : wr >= 50 ? "text-blue-400"
    : wr >= 45 ? "text-yellow-400"
    : "text-red-400";

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors group
        ${isActive ? "bg-blue-900/30" : "hover:bg-white/[0.04]"}
      `}
      onMouseDown={(e) => { e.preventDefault(); onSelect(entry.riotId); }}
    >
      {/* Avatar: inicial do nome */}
      <div className="w-7 h-7 rounded-lg bg-blue-800/40 border border-blue-700/30
                      flex items-center justify-center text-blue-300 text-xs font-bold shrink-0">
        {entry.gameName?.[0]?.toUpperCase() ?? "?"}
      </div>

      {/* Nome + info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium leading-none truncate">
          {entry.gameName}
          <span className="text-gray-600 font-normal text-xs ml-1">#{entry.tagLine}</span>
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {entry.topChampion && (
            <span className="text-[10px] text-gray-500 truncate">{entry.topChampion}</span>
          )}
          {wr != null && (
            <span className={`text-[10px] font-semibold ${wrColor}`}>{wr}% WR</span>
          )}
        </div>
      </div>

      {/* Tempo + ícone chevron / remover */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] text-gray-700">{formatRelTime(entry.timestamp)}</span>
        {isActive
          ? <ChevronRight size={12} className="text-blue-400" />
          : (
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5
                         text-gray-600 hover:text-red-400"
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(entry.riotId); }}
              title="Remover do histórico"
            >
              <X size={12} />
            </button>
          )
        }
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

/**
 * @param {object}   props
 * @param {boolean}  props.loading     — estado de carregamento externo
 * @param {function} props.onSearch    — callback(riotId: string) chamado ao submeter
 * @param {function} props.onNewData   — callback(data) para enriquecer histórico após busca bem-sucedida
 */
export default function SearchBar({ loading, onSearch, onNewData }) {
  const [input,      setInput]      = useState("");
  const [focused,    setFocused]    = useState(false);
  const [activeIdx,  setActiveIdx]  = useState(-1);
  const [liveHint,   setLiveHint]   = useState(null);   // sugestão da API em tempo real
  const [hintLoading, setHintLoading] = useState(false);

  const inputRef    = useRef(null);
  const containerRef = useRef(null);

  const { history, addToHistory, removeFromHistory, clearHistory } = useSearchHistory();

  // ── Expõe addToHistory para o pai enriquecer após busca bem-sucedida ────────
  useEffect(() => {
    if (onNewData) onNewData(addToHistory);
  }, [onNewData, addToHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sugestões filtradas por texto digitado ───────────────────────────────────
  const filteredHistory = input.trim()
    ? history.filter((h) =>
        h.riotId.toLowerCase().includes(input.trim().toLowerCase()) ||
        h.gameName?.toLowerCase().startsWith(input.trim().toLowerCase())
      )
    : history;

  // Sugestões visíveis: histórico filtrado + liveHint (se não duplicado)
  const suggestions = [
    ...filteredHistory,
    ...(liveHint && !filteredHistory.find(h => h.riotId.toLowerCase() === liveHint.riotId.toLowerCase())
        ? [liveHint] : []),
  ];

  const showDropdown = focused && suggestions.length > 0;

  // ── Debounce: busca de validação ao digitar ──────────────────────────────────
  const debouncedInput = useDebounce(input, 300);

  useEffect(() => {
    // Só tenta se parece um Riot ID completo (tem #) e ao menos 3 chars antes do #
    const trimmed = debouncedInput.trim();
    if (!trimmed.includes("#") || trimmed.split("#")[0].length < 3) {
      setLiveHint(null);
      return;
    }
    // Não re-busca se já está no histórico
    if (history.find(h => h.riotId.toLowerCase() === trimmed.toLowerCase())) {
      setLiveHint(null);
      return;
    }

    let cancelled = false;
    setHintLoading(true);

    fetch(`/api/player/${encodeURIComponent(trimmed)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.gameName) return;
        const hint = {
          riotId:      `${data.gameName}#${data.tagLine}`,
          gameName:    data.gameName,
          tagLine:     data.tagLine,
          topChampion: data.stats?.topChampion ?? null,
          winrate:     data.stats?.winrate     ?? null,
          timestamp:   null, // hint ao vivo, sem timestamp
        };
        setLiveHint(hint);
      })
      .catch(() => { /* silencia 404s */ })
      .finally(() => { if (!cancelled) setHintLoading(false); });

    return () => { cancelled = true; setHintLoading(false); };
  }, [debouncedInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const submitSearch = useCallback((riotId) => {
    const id = (riotId ?? input).trim();
    if (!id) return;
    setInput(id);
    setFocused(false);
    setActiveIdx(-1);
    onSearch(id);
  }, [input, onSearch]);

  function handleKeyDown(e) {
    if (!showDropdown) {
      if (e.key === "Enter") submitSearch();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        submitSearch(suggestions[activeIdx].riotId);
      } else {
        submitSearch();
      }
    } else if (e.key === "Escape") {
      setFocused(false);
      setActiveIdx(-1);
    }
  }

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setFocused(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reseta activeIdx ao mudar sugestões
  useEffect(() => { setActiveIdx(-1); }, [filteredHistory.length]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="relative w-full max-w-sm mx-auto">

      {/* ── Input + botão ─────────────────────────────────────────────────── */}
      <form
        onSubmit={(e) => { e.preventDefault(); submitSearch(); }}
        className="flex gap-3"
      >
        <div className="relative flex-1">
          {/* Ícone esquerdo */}
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />

          {/* Spinner de hint ao vivo */}
          {hintLoading && (
            <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 animate-spin" />
          )}

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setActiveIdx(-1); }}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKeyDown}
            placeholder="Delsin#LEWA"
            disabled={loading}
            autoComplete="off"
            spellCheck="false"
            className="w-full bg-surface-800 border border-white/10 rounded-xl pl-9 pr-8 py-3
                       text-white placeholder-gray-600 text-sm focus:outline-none
                       focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                       disabled:opacity-50 transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="btn-primary flex items-center gap-2 shrink-0"
        >
          {loading
            ? <Loader2 size={14} className="animate-spin" />
            : <Search size={14} />
          }
          {loading ? "Buscando…" : "Analisar"}
        </button>
      </form>

      {/* ── Dropdown ──────────────────────────────────────────────────────── */}
      {showDropdown && (
        <div className="
          absolute top-full left-0 right-0 mt-2 z-50
          bg-[#0d1117] border border-white/10 rounded-2xl shadow-2xl
          overflow-hidden
        ">
          {/* Cabeçalho do dropdown */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
              <Clock size={10} />
              {input.trim() ? "Sugestões" : "Pesquisas Recentes"}
            </span>
            {!input.trim() && history.length > 0 && (
              <button
                onMouseDown={(e) => { e.preventDefault(); clearHistory(); }}
                className="flex items-center gap-1 text-[10px] text-gray-700 hover:text-red-400 transition-colors"
              >
                <Trash2 size={10} />Limpar
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="py-1 max-h-72 overflow-y-auto"
               style={{ scrollbarWidth: "thin", scrollbarColor: "#1d4ed8 #0d1117" }}>
            {suggestions.map((entry, i) => (
              <HistoryItem
                key={entry.riotId}
                entry={entry}
                isActive={i === activeIdx}
                onSelect={submitSearch}
                onRemove={removeFromHistory}
              />
            ))}
          </div>

          {/* Hint de teclado */}
          <div className="px-4 py-2 border-t border-white/5 flex items-center gap-3 text-[10px] text-gray-700">
            <span>↑↓ navegar</span>
            <span>Enter selecionar</span>
            <span>Esc fechar</span>
          </div>
        </div>
      )}
    </div>
  );
}
