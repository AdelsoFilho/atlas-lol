import { useMemo } from "react";
import { Target, ShieldAlert, Swords, Brain, Zap } from "lucide-react";

// =============================================================================
// NextGameMode.jsx — Foco no Próximo Jogo (Mobile-First)
//
// View minimalista: 3 informações críticas antes de entrar na fila.
//   1. Campeão recomendado (melhor WR do pool recente)
//   2. Foco mental único (baseado na fraqueza principal)
//   3. Prioridade de ban (top kryptonita)
//
// Props:
//   matches    {Array}  — recentMatches do App
//   matchups   {object} — dados do MatchupPanel (passados como prop, opcional)
//   riotId     {string}
// =============================================================================

// Analisa matches localmente para recomendar campeão e foco mental
function deriveLocalInsights(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return null;

  // ── Campeão recomendado ────────────────────────────────────────────────────
  const champMap = {};
  for (const m of matches) {
    const c = m.champion;
    if (!champMap[c]) champMap[c] = { wins: 0, games: 0, kda: [] };
    champMap[c].games++;
    if (m.win) champMap[c].wins++;
    if (m.kda != null) champMap[c].kda.push(m.kda);
  }

  const champList = Object.entries(champMap)
    .filter(([, d]) => d.games >= 2)
    .map(([champion, d]) => ({
      champion,
      games:   d.games,
      winrate: Math.round((d.wins / d.games) * 100),
      avgKDA:  d.kda.length ? parseFloat((d.kda.reduce((s, v) => s + v, 0) / d.kda.length).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.winrate - a.winrate || b.avgKDA - a.avgKDA);

  const recommended = champList[0] ?? null;

  // ── Foco mental — detecta a maior fraqueza ────────────────────────────────
  const recent = matches.slice(0, 10);
  const avgDeaths = recent.reduce((s, m) => s + (m.deaths ?? 0), 0) / recent.length;
  const avgCS     = recent.reduce((s, m) => s + (m.analysis?.csPerMin ?? 0), 0) / recent.length;
  const avgVPM    = recent.reduce((s, m) => {
    return s + (m.durationMin > 0 && m.analysis?.visionScore != null
      ? m.analysis.visionScore / m.durationMin : 0);
  }, 0) / recent.length;

  // Losing streak
  let streak = 0;
  for (const m of recent) {
    if (!m.win) streak++;
    else break;
  }

  let mentalFocus = "Foque em decisões macro após cada kill — jogue com objetivo.";
  if (streak >= 3) {
    mentalFocus = `Você está em uma sequência de ${streak} derrotas. Jogue apenas 1 partida hoje.`;
  } else if (avgDeaths > 5) {
    mentalFocus = `Média de ${avgDeaths.toFixed(1)} mortes/jogo. Priorize não morrer nos primeiros 10 min.`;
  } else if (avgCS < 5.5) {
    mentalFocus = `CS/min em ${avgCS.toFixed(1)} — meta simples: farme 7 CS/min hoje sem se importar com kills.`;
  } else if (avgVPM < 0.7) {
    mentalFocus = "Vision score baixo. Compre Control Ward em cada recall e varde entradas antes de objetivos.";
  }

  return { recommended, mentalFocus, streak };
}

export default function NextGameMode({ matches, matchups }) {
  const insights = useMemo(() => deriveLocalInsights(matches), [matches]);
  const banPrio  = matchups?.banPriority ?? [];
  const topBan   = banPrio[0] ?? null;

  if (!insights) {
    return (
      <div className="card text-center py-10 text-gray-500 text-sm">
        Busque um jogador primeiro para ver o foco do próximo jogo.
      </div>
    );
  }

  const { recommended, mentalFocus, streak } = insights;

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-purple-400">Foco no Próximo Jogo</p>
        <p className="text-gray-500 text-xs">3 informações. Nada mais.</p>
      </div>

      {/* Card 1 — Campeão Recomendado */}
      <div className="card border border-blue-700/30 bg-blue-900/10 space-y-3">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-blue-400" />
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Campeão Recomendado</p>
        </div>
        {recommended ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-white">{recommended.champion}</p>
              <p className="text-gray-500 text-xs mt-0.5">
                {recommended.games} jogos · WR{" "}
                <span className={recommended.winrate >= 50 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                  {recommended.winrate}%
                </span>
                {" "}· KDA{" "}
                <span className="text-blue-400 font-bold">{recommended.avgKDA}</span>
              </p>
            </div>
            <div className={`text-3xl font-black px-4 py-2 rounded-2xl border ${
              recommended.winrate >= 50
                ? "text-emerald-400 bg-emerald-900/20 border-emerald-700/30"
                : "text-yellow-400 bg-yellow-900/20 border-yellow-700/30"
            }`}>
              {recommended.winrate}%
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Jogue pelo menos 2 partidas com o mesmo campeão para recomendação.</p>
        )}
      </div>

      {/* Card 2 — Foco Mental */}
      <div className={`card border space-y-3 ${
        streak >= 3
          ? "border-orange-700/30 bg-orange-900/10"
          : "border-purple-700/20 bg-purple-900/10"
      }`}>
        <div className="flex items-center gap-2">
          <Brain size={14} className={streak >= 3 ? "text-orange-400" : "text-purple-400"} />
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Único Foco Mental</p>
        </div>
        <p className={`text-sm leading-relaxed font-medium ${streak >= 3 ? "text-orange-300" : "text-gray-200"}`}>
          "{mentalFocus}"
        </p>
      </div>

      {/* Card 3 — Ban Priority */}
      <div className="card border border-red-700/20 bg-red-900/10 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} className="text-red-400" />
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Ban Priority</p>
        </div>
        {topBan ? (
          <div className="flex items-center gap-3">
            <p className="text-2xl font-bold text-white">{topBan}</p>
            {banPrio.slice(1).map(b => (
              <span key={b} className="text-sm text-gray-500 font-medium">{b}</span>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">
            Nenhuma kryptonita identificada. Bane o campeão que você menos sabe jogar contra.
          </p>
        )}
      </div>

      {/* Nota */}
      <p className="text-gray-700 text-xs text-center">
        Baseado nas suas últimas {Math.min(matches?.length ?? 0, 10)} partidas
      </p>
    </div>
  );
}
