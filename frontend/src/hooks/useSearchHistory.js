// =============================================================================
// useSearchHistory — Persiste histórico de buscas no localStorage
// Cada entrada: { riotId, gameName, tagLine, topChampion, winrate, timestamp }
// =============================================================================

import { useState, useCallback } from "react";

const STORAGE_KEY = "atlas_search_history";
const MAX_ENTRIES = 8;

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // quota exceeded — silencia
  }
}

/**
 * Hook para gerenciar o histórico de pesquisas persistente.
 *
 * @returns {{
 *   history:         Array<{riotId,gameName,tagLine,topChampion,winrate,timestamp}>,
 *   addToHistory:    (entry: object) => void,
 *   removeFromHistory: (riotId: string) => void,
 *   clearHistory:    () => void,
 * }}
 */
export function useSearchHistory() {
  const [history, setHistory] = useState(loadHistory);

  const addToHistory = useCallback((entry) => {
    setHistory((prev) => {
      // Remove duplicata (case-insensitive no riotId)
      const filtered = prev.filter(
        (h) => h.riotId.toLowerCase() !== entry.riotId.toLowerCase()
      );
      const next = [
        { ...entry, timestamp: Date.now() },
        ...filtered,
      ].slice(0, MAX_ENTRIES);
      saveHistory(next);
      return next;
    });
  }, []);

  const removeFromHistory = useCallback((riotId) => {
    setHistory((prev) => {
      const next = prev.filter(
        (h) => h.riotId.toLowerCase() !== riotId.toLowerCase()
      );
      saveHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  }, []);

  return { history, addToHistory, removeFromHistory, clearHistory };
}
