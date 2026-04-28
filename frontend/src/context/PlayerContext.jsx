import { createContext, useContext, useState, useRef, useCallback } from "react";
import axios from "axios";

// =============================================================================
// PlayerContext — Estado global do jogador analisado
//
// Provê:
//   playerData  { gameName, tagLine, stats, recentMatches, diagnosis }
//   puuid       string | null
//   riotId      "Nome#TAG" | null
//   loading     boolean
//   error       string | null
//   search(id)  async fn — busca o jogador na API e atualiza o estado
//   addToHistoryRef  ref para o callback do SearchBar (enriquece histórico)
// =============================================================================

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const [playerData, setPlayerData] = useState(null);
  const [puuid,      setPuuid]      = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  const addToHistoryRef = useRef(null);

  const search = useCallback(async (riotId) => {
    if (!riotId?.trim()) return;
    setError(null);
    setPlayerData(null);
    setPuuid(null);
    setLoading(true);

    try {
      const { data } = await axios.get(`/api/player/${encodeURIComponent(riotId.trim())}`);
      if (!data?.gameName) throw new Error("Resposta inesperada do servidor.");

      setPlayerData(data);

      // Extrai PUUID do primeiro participante identificado como o jogador
      const playerPuuid =
        data.recentMatches?.[0]?.participants?.find(p => p.isPlayer)?.puuid ?? null;
      setPuuid(playerPuuid);

      // Enriquece o histórico de buscas no SearchBar/Sidebar
      addToHistoryRef.current?.({
        riotId:      riotId.trim(),
        gameName:    data.gameName,
        tagLine:     data.tagLine,
        topChampion: data.stats?.topChampion ?? null,
        winrate:     data.stats?.winrate     ?? null,
      });
    } catch (err) {
      const msg =
        err.response?.data?.error ??
        (err.code === "ECONNREFUSED" ? "Servidor offline." : null) ??
        err.message ?? "Erro desconhecido.";
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
