import { useState, useRef } from "react";
import axios from "axios";
import {
  TrendingUp, Coins, Loader2, AlertCircle, Shield,
  Crosshair, CheckSquare, Square, Activity, AlertTriangle,
  Swords, Repeat2, Trophy, Target, Gamepad2, BarChart3,
} from "lucide-react";
import MatchList        from "./components/MatchList";
import SearchBar        from "./components/SearchBar";
import CoachingReport   from "./components/CoachingReport";
import MissionControl   from "./components/MissionControl";
import RadarEvolucao    from "./components/RadarEvolucao";
import MatchupPanel     from "./components/MatchupPanel";
import NextGameMode     from "./components/NextGameMode";
import ShareCard        from "./components/ShareCard";
import LiveMatchOverlay from "./components/LiveMatchOverlay";

// ─── Helpers de cor ──────────────────────────────────────────────────────────

const wrColor = (wr) =>
  wr >= 60 ? "text-emerald-400"
  : wr >= 50 ? "text-blue-400"
  : wr >= 45 ? "text-yellow-400"
  : "text-red-400";

const wrBg = (wr) =>
  wr >= 50 ? "bg-emerald-900/20 border-emerald-700/30"
  : wr >= 45 ? "bg-yellow-900/20 border-yellow-700/30"
  : "bg-red-900/20 border-red-700/30";

const kdaColor = (k) =>
  k >= 4 ? "text-emerald-400"
  : k >= 2.5 ? "text-blue-400"
  : k >= 1.5 ? "text-yellow-400"
  : "text-red-400";

// ─── MetricCard ──────────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, sub, valueClass = "text-white", className = "" }) {
  return (
    <div className={`card flex flex-col gap-3 ${className}`}>
      <p className="flex items-center gap-1.5 text-gray-500 text-xs font-medium uppercase tracking-wider">
        <Icon size={12} className="text-blue-400" />{label}
      </p>
      <p className={`text-3xl font-bold tracking-tight leading-none ${valueClass}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs leading-snug">{sub}</p>}
    </div>
  );
}

// ─── ActionItem (checkbox) ───────────────────────────────────────────────────

function ActionItem({ text, checked, onToggle }) {
  return (
    <button onClick={onToggle} className="flex items-start gap-3 w-full text-left py-2.5 group">
      <span className="mt-0.5 shrink-0">
        {checked
          ? <CheckSquare size={17} className="text-blue-400" />
          : <Square      size={17} className="text-gray-600 group-hover:text-gray-400 transition-colors" />}
      </span>
      <span className={`text-sm leading-relaxed transition-colors ${
        checked ? "line-through text-gray-600" : "text-gray-300 group-hover:text-white"
      }`}>{text}</span>
    </button>
  );
}

// ─── App principal ────────────────────────────────────────────────────────────

export default function App() {
  const [loading,    setLoading]    = useState(false);
  const [data,       setData]       = useState(null);
  const [puuid,      setPuuid]      = useState(null);
  const [error,      setError]      = useState("");
  const [checked,    setChecked]    = useState({});
  const [activeTab,  setActiveTab]  = useState("desempenho");

  // Referência para a função addToHistory do SearchBar (injetada via onNewData)
  const addToHistoryRef = useRef(null);

  async function doSearch(riotId) {
    if (!riotId?.trim()) return;

    console.log("[Atlas] Buscando:", riotId);
    setError(""); setData(null); setPuuid(null); setChecked({}); setActiveTab("desempenho"); setLoading(true);

    try {
      console.log("[Atlas] GET /api/player/" + encodeURIComponent(riotId));
      const { data: res } = await axios.get(`/api/player/${encodeURIComponent(riotId)}`);
      console.log("[Atlas] Resposta 200:", res);
      if (!res?.gameName) throw new Error("Estrutura de resposta inesperada do servidor.");
      setData(res);

      // Persiste no histórico de buscas
      addToHistoryRef.current?.({
        riotId,
        gameName:    res.gameName,
        tagLine:     res.tagLine,
        topChampion: res.stats?.topChampion ?? null,
        winrate:     res.stats?.winrate     ?? null,
      });

      // Extrai PUUID do primeiro participante que é o jogador, ou das partidas
      const playerPuuid = res.recentMatches?.[0]?.participants?.find(p => p.isPlayer)?.puuid ?? null;
      setPuuid(playerPuuid);
      console.log("[Atlas] PUUID extraído:", playerPuuid?.slice(0, 16) + "…");
    } catch (err) {
      const msg = err.response?.data?.error
        ?? (err.code === "ECONNREFUSED" ? "Servidor offline. Execute: npm run dev" : null)
        ?? err.message ?? "Erro desconhecido.";
      console.error("[Atlas] Erro:", msg, err);
      setError(msg);
    } finally {
      setLoading(false);
      console.log("[Atlas] Busca concluída.");
    }
  }

  const toggleCheck = (i) => setChecked((p) => ({ ...p, [i]: !p[i] }));

  const gameName  = data?.gameName     ?? "";
  const tagLine   = data?.tagLine      ?? "";
  const stats     = data?.stats        ?? null;
  const matches   = data?.recentMatches ?? [];
  const diagnosis = data?.diagnosis    ?? null;
  const completedCount = Object.values(checked).filter(Boolean).length;
  const totalTasks     = diagnosis?.plan?.length ?? 0;

  return (
    <div className="min-h-screen bg-surface-900">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-white/5 bg-surface-800/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <Shield size={15} className="text-white" />
          </div>
          <span className="font-bold text-white">Atlas</span>
          <span className="text-gray-600 text-sm">LoL Performance</span>
          <span className="ml-auto text-xs text-gray-700 hidden sm:block">
            {matches.length > 0 ? `${matches.length} partidas · análise detalhada` : "análise granular por partida"}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">

        {/* ── Busca ──────────────────────────────────────────────────────── */}
        <section className="text-center space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-4xl font-bold text-white">
              Por que você{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                não sobe de elo?
              </span>
            </h1>
            <p className="text-gray-400 text-sm">
              20 partidas · análise jogo a jogo · gráfico de ouro · timeline de eventos
            </p>
          </div>

          <SearchBar
            loading={loading}
            onSearch={doSearch}
            onNewData={(fn) => { addToHistoryRef.current = fn; }}
          />
        </section>

        {/* ── Erro ──────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-3 bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-red-300 text-sm">
            <AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        {/* ── Skeleton ──────────────────────────────────────────────────── */}
        {loading && (
          <div className="space-y-4 animate-pulse">
            <div className="h-16 card bg-surface-700" />
            <div className="grid grid-cols-3 gap-4">
              {[1,2,3].map((i) => <div key={i} className="h-28 card bg-surface-700" />)}
            </div>
            {[1,2,3,4,5].map((i) => <div key={i} className="h-14 rounded-2xl bg-surface-700" />)}
            <div className="h-48 card bg-surface-700" />
          </div>
        )}

        {/* ── Dashboard ─────────────────────────────────────────────────── */}
        {data && !loading && (
          <>
            {/* Cabeçalho do jogador */}
            <div className="card flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-600/30
                              flex items-center justify-center text-blue-300 font-bold text-lg shrink-0">
                {gameName[0]?.toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-bold text-white leading-none">
                  {gameName}<span className="text-gray-500 font-normal text-sm ml-1">#{tagLine}</span>
                </p>
                {stats && (
                  <p className="text-gray-500 text-xs mt-0.5">
                    {stats.gamesPlayed} partidas · Campeão principal:{" "}
                    <span className="text-blue-400">{stats.topChampion}</span>
                  </p>
                )}
              </div>
              <div className="ml-auto shrink-0">
                <ShareCard riotId={`${gameName}#${tagLine}`} stats={stats} matches={matches} />
              </div>
            </div>

            {!stats && (
              <div className="card text-center py-10 text-gray-500 text-sm">
                Nenhuma partida recente encontrada.
              </div>
            )}

            {stats && (
              <>
                {/* ── War Room ao Vivo ───────────────────────────────── */}
                <LiveMatchOverlay riotId={`${gameName}#${tagLine}`} />

                {/* ── Navegação por Abas ─────────────────────────────── */}
                <div className="flex gap-1 bg-surface-800 border border-white/5 rounded-2xl p-1">
                  {[
                    { id: "desempenho", label: "Desempenho",  Icon: BarChart3 },
                    { id: "missoes",    label: "Missões",      Icon: Target    },
                    { id: "matchups",   label: "Matchups",     Icon: Swords    },
                    { id: "proximo",    label: "Próximo Jogo", Icon: Gamepad2  },
                  ].map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl
                                  text-xs font-semibold transition-all ${
                        activeTab === id
                          ? "bg-blue-600 text-white shadow"
                          : "text-gray-500 hover:text-gray-300 hover:bg-surface-700"
                      }`}
                    >
                      <Icon size={11} className="hidden sm:block shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>

                {/* ── Aba: Desempenho ────────────────────────────────── */}
                {activeTab === "desempenho" && <>
                {/* ── Métricas agregadas ─────────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className={`card border flex flex-col gap-3 ${wrBg(stats.winrate)}`}>
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-gray-400">
                      <TrendingUp size={12} className="text-blue-400" />Winrate Recente
                    </p>
                    <p className={`text-4xl font-bold leading-none ${wrColor(stats.winrate)}`}>{stats.winrate}%</p>
                    <p className="text-gray-500 text-xs">{stats.wins}V / {stats.losses}D em {stats.gamesPlayed} partidas</p>
                  </div>

                  <MetricCard
                    icon={Crosshair} label="KDA Médio" value={stats.kda}
                    sub={`${stats.avgKills} abates · ${stats.avgDeaths} mortes · ${stats.avgAssists} assists`}
                    valueClass={kdaColor(stats.kda)}
                  />
                  <MetricCard
                    icon={Coins} label="Gold / Minuto" value={stats.avgGoldPerMin}
                    sub={`média das ${stats.gamesPlayed} partidas`}
                    valueClass={stats.avgGoldPerMin >= 350 ? "text-emerald-400" : "text-red-400"}
                  />
                </div>

                {/* ── Lista de Partidas (com modal) ──────────────────── */}
                {matches.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-widest">
                      <Swords size={13} />Análise por Partida
                      <span className="text-gray-700 font-normal normal-case ml-1">
                        — expanda ou clique em "Detalhe" para gráfico + timeline
                      </span>
                    </h2>
                    <MatchList matches={matches} puuid={puuid} />
                  </div>
                )}

                {/* ── Relatório de Coaching ─────────────────────────── */}
                <CoachingReport riotId={`${gameName}#${tagLine}`} />

                {/* ── Diagnóstico Geral ──────────────────────────────── */}
                {diagnosis && (
                  <div className="card space-y-6">
                    <div className="flex items-center gap-2">
                      <Activity size={16} className="text-blue-400" />
                      <h2 className="font-semibold text-white">Diagnóstico Geral</h2>
                    </div>

                    {/* Alerta de morte */}
                    {diagnosis.deathWarning && (
                      <div className="flex items-start gap-3 bg-orange-900/30 border border-orange-700/40
                                      rounded-xl px-4 py-3 text-orange-300 text-sm">
                        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                        <span>{diagnosis.deathWarning}</span>
                      </div>
                    )}

                    {/* Problema principal */}
                    <div className="bg-surface-700 border border-white/5 rounded-2xl p-5 space-y-2">
                      <p className="text-xs font-bold uppercase tracking-widest text-blue-400">Problema Principal</p>
                      <h3 className="text-xl font-bold text-white">{diagnosis.title}</h3>
                      <p className="text-gray-300 text-sm leading-relaxed">{diagnosis.text}</p>
                    </div>

                    {/* Padrões Recorrentes */}
                    {diagnosis.recurringPatterns?.length > 0 && (
                      <div className="space-y-2">
                        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
                          <Repeat2 size={13} />Padrões Detectados nas {stats.gamesPlayed} Partidas
                        </p>
                        <div className="bg-surface-700 border border-white/5 rounded-2xl px-5 py-4 space-y-2">
                          {diagnosis.recurringPatterns.map((p, i) => (
                            <p key={i} className="text-gray-300 text-sm leading-relaxed flex gap-2">
                              <span className="text-yellow-500 shrink-0">→</span>{p}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Comparação campeão principal vs outros */}
                    {diagnosis.champStats && diagnosis.othersStats && (
                      <div className="space-y-2">
                        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
                          <Trophy size={13} />{diagnosis.champStats.champion} vs. Outros Campeões
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            {
                              label:   diagnosis.champStats.champion,
                              games:   diagnosis.champStats.games,
                              winrate: diagnosis.champStats.winrate,
                              kda:     diagnosis.champStats.avgKDA,
                              accent:  "border-blue-700/40 bg-blue-900/10",
                            },
                            {
                              label:   "Outros",
                              games:   diagnosis.othersStats.games,
                              winrate: diagnosis.othersStats.winrate,
                              kda:     diagnosis.othersStats.avgKDA,
                              accent:  "border-white/5 bg-surface-700",
                            },
                          ].map(({ label, games, winrate, kda, accent }) => (
                            <div key={label} className={`rounded-2xl border p-4 space-y-1 ${accent}`}>
                              <p className="text-xs text-gray-400 font-medium">{label}</p>
                              <p className={`text-2xl font-bold ${wrColor(winrate)}`}>{winrate}% WR</p>
                              <p className="text-gray-500 text-xs">{games} jogo(s) · KDA {kda}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Plano de Ação */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                          Plano de Ação
                        </p>
                        {totalTasks > 0 && (
                          <span className="text-xs text-gray-600">{completedCount}/{totalTasks} feitas</span>
                        )}
                      </div>
                      <div className="bg-surface-700 border border-white/5 rounded-2xl px-5 divide-y divide-white/5">
                        {diagnosis.plan.map((task, i) => (
                          <ActionItem key={i} text={task} checked={!!checked[i]} onToggle={() => toggleCheck(i)} />
                        ))}
                      </div>
                      {completedCount === totalTasks && totalTasks > 0 && (
                        <div className="flex items-center gap-2 text-emerald-400 text-sm justify-center pt-2">
                          <CheckSquare size={14} />Plano concluído — analise novamente após 10 partidas!
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* ── fim aba Desempenho ── */}
                </>}

                {/* ── Aba: Missões ──────────────────────────────────── */}
                {activeTab === "missoes" && (
                  <MissionControl riotId={`${gameName}#${tagLine}`} />
                )}

                {/* ── Aba: Matchups ─────────────────────────────────── */}
                {activeTab === "matchups" && (
                  <>
                    <RadarEvolucao matches={matches} />
                    <MatchupPanel  riotId={`${gameName}#${tagLine}`} />
                  </>
                )}

                {/* ── Aba: Próximo Jogo ─────────────────────────────── */}
                {activeTab === "proximo" && (
                  <NextGameMode matches={matches} riotId={`${gameName}#${tagLine}`} />
                )}
              </>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-white/5 mt-16 py-5 text-center text-gray-700 text-xs">
        Atlas LoL · não afiliado à Riot Games · dados via Riot API · motor de regras local
      </footer>
    </div>
  );
}
