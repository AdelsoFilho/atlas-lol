import { createContext, useContext, useState, useRef, useCallback } from "react";
import axios from "axios";

// =============================================================================
// PlayerContext — Estado global do jogador analisado
//
// Persiste em sessionStorage para sobreviver a refreshes e navegação direta
// para /match/:id sem precisar rebuscar o jogador.
//
// Provê:
//   playerData  { gameName, tagLine, puuid, stats, recentMatches, diagnosis }
//   puuid       string | null
//   riotId      "Nome#TAG" | null
//   loading     boolean
//   error       string | null
//   search(id)  async fn
//   addToHistoryRef  ref para callback do SearchBar
// =============================================================================

const PlayerContext = createContext(null);

// ── sessionStorage helpers ────────────────────────────────────────────────────

const SESSION_KEY = "atlas_player_v2";

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveSession(playerData, puuid) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ playerData, puuid }));
  } catch {}
}

function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function PlayerProvider({ children }) {
  // Lazy init: restaura do sessionStorage imediatamente (antes do primeiro render)
  const [playerData, setPlayerData] = useState(() => loadSession()?.playerData ?? null);
  const [puuid,      setPuuid]      = useState(() => loadSession()?.puuid      ?? null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  const addToHistoryRef = useRef(null);

  const search = useCallback(async (riotId) => {
    if (!riotId?.trim()) return;
    setError(null);
    // Não limpa playerData aqui — mantém dados anteriores visíveis durante o
    // carregamento. O estado antigo só é descartado em caso de erro ou quando o
    // novo dado chega com sucesso, evitando flash de tela vazia.
    setLoading(true);

    try {
      const { data } = await axios.get(`/api/player/${encodeURIComponent(riotId.trim())}`);
      if (!data?.gameName) throw new Error("Resposta inesperada do servidor.");

      setPlayerData(data);

      // O servidor inclui puuid diretamente no payload desde a refatoração.
      // Fallback: extrai do array de participantes (compatibilidade com cache antigo).
      const playerPuuid =
        data.puuid ??
        data.recentMatches?.[0]?.participants?.find(p => p.isPlayer)?.puuid ??
        null;
      setPuuid(playerPuuid);

      // Persiste na sessão — sobrevive a refreshes e navegação direta por URL
      saveSession(data, playerPuuid);

      addToHistoryRef.current?.({
        riotId:      riotId.trim(),
        gameName:    data.gameName,
        tagLine:     data.tagLine,
        topChampion: data.stats?.topChampion ?? null,
        winrate:     data.stats?.winrate     ?? null,
      });
    } catch (err) {
      // Só limpa os dados anteriores em caso de erro — assim o usuário não vê
      // uma tela vazia caso a nova busca falhe por problema temporário de rede.
      setPlayerData(null);
      setPuuid(null);
      clearSession();
      const msg =
        err.response?.data?.error ??
        (err.code === "ECONNREFUSED" ? "Servidor offline." : null) ??
        err.message ??
        "Erro desconhecido.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const riotId = playerData
    ? `${playerData.gameName}#${playerData.tagLine}`
    : null;

  return (
    <PlayerContext.Provider value={{
      playerData,
      puuid,
      riotId,
      loading,
      error,
      search,
      addToHistoryRef,
      setPlayerData,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer deve ser usado dentro de <PlayerProvider>");
  return ctx;
}
