import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, Coins, Crosshair, BarChart3, AlertCircle,
  Search, Loader2, Swords, Target, Trophy, ChevronRight,
  Activity, Repeat2, AlertTriangle, CheckSquare, Square,
} from "lucide-react";
import { useState } from "react";
import SearchBar from "../components/SearchBar";
import CoachingReport from "../components/CoachingReport";
import RadarEvolucao from "../components/RadarEvolucao";
import { usePlayer } from "../context/PlayerContext";

// =============================================================================
// HomeView — Dashboard principal
//
// Sem jogador: Hero section com busca central
// Com jogador:  Métricas agregadas + preview de partidas + diagnóstico
// =============================================================================

// ── Helpers ──────────────────────────────────────────────────────────────────

function wrColor(wr) {
  return wr >= 60 ? "text-emerald-400"
       : wr >= 50 ? "text-emerald-500"
       : wr >= 45 ? "text-yellow-400"
       : "text-neon-red";
}

function kdaColor(k) {
  return k >= 4 ? "text-emerald-400"
       : k >= 2.5 ? "text-blue-400"
       : k >= 1.5 ? "text-yellow-400"
       : "text-neon-red";
}

// ── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, sub, valueClass = "text-white", accent = false }) {
  return (
    <div className={`card hover-glow flex flex-col gap-3 ${
      accent ? "border-electric/25 bg-electric/5" : ""
    }`}>
      <p className="label-xs flex items-center gap-1.5">
        <Icon size={11} className={accent ? "text-electric" : "text-slate-500"} />
        {label}
      </p>
      <p className={`stat-value ${valueClass}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs leading-snug">{sub}</p>}
    </div>
  );
}

// ── Mini Match Row ────────────────────────────────────────────────────────────

function MiniMatchRow({ match, onClick }) {
  const { win, champion, kills, deaths, assists, kda, durationMin } = match;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5
                 border-b border-white/5 last:border-0 transition-colors text-left group"
    >
      <span className={`text-xs font-bold w-4 shrink-0 ${win ? "text-emerald-400" : "text-neon-red"}`}>
        {win ? "V" : "D"}
      </span>
      <span className="font-mono text-xs text-electric/70 w-20 truncate shrink-0">{champion}</span>
      <span className={`font-mono text-sm font-bold ${kdaColor(kda)} shrink-0`}>
        {kills}/{deaths}/{assists}
      </span>
      <span className="text-slate-600 text-xs font-mono ml-auto shrink-0">{durationMin}m</span>
      <ChevronRight size={12} className="text-slate-700 group-hover:text-electric/50 transition-colors shrink-0" />
    </button>
  );
}

// ── Action Item (plano de coaching) ──────────────────────────────────────────

function ActionItem({ text, checked, onToggle }) {
  return (
    <button onClick={onToggle} className="flex items-start gap-3 w-full text-left py-2.5 group">
      <span className="mt-0.5 shrink-0">
        {checked
          ? <CheckSquare size={15} className="text-electric" />
          : <Square size={15} className="text-slate-700 group-hover:text-slate-500 transition-colors" />}
      </span>
      <span className={`text-sm leading-relaxed transition-colors ${
        checked ? "line-through text-slate-600" : "text-slate-300 group-hover:text-white"
      }`}>{text}</span>
    </button>
  );
}

// ── Hero Section (sem jogador) ────────────────────────────────────────────────

function HeroSection() {
  const { search, loading, addToHistoryRef } = usePlayer();

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-0px)] px-8 text-center">
      {/* Glow decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2
                        w-96 h-96 bg-electric/3 rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/3 w-64 h-64 bg-neon-purple/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 space-y-8 max-w-lg w-full">
        {/* Logo mark */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-electric/10 border border-electric/40
                          flex items-center justify-center animate-glow-pulse">
            <BarChart3 size={28} className="text-electric" />
          </div>
        </div>

        {/* Headlines */}
        <div className="space-y-3">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Análise Pós-Game<br />
            <span className="text-transparent bg-clip-text"
                  style={{ backgroundImage: "linear-gradient(135deg, #00F0FF, #7B2CBF)" }}>
              de Alto Nível
            </span>
          </h1>
          <p className="text-slate-400 text-base leading-relaxed">
            20 partidas · timeline interativa · coaching acionável<br />
            Entenda exatamente por que você não sobe de elo.
          </p>
        </div>

        {/* Search */}
        <div className="w-full">
          <SearchBar
            loading={loading}
            onSearch={search}
            onNewData={(fn) => { addToHistoryRef.current = fn; }}
          />
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {["Gold Diff", "Timeline de Eventos", "Counter-picks", "Coaching IA", "Draft Assistant"].map(f => (
            <span key={f} className="tag-cyan text-[11px]">{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Dashboard (com jogador carregado) ────────────────────────────────────────

function Dashboard() {
  const { playerData, puuid, riotId } = usePlayer();
  const navigate = useNavigate();
  const [checked, setChecked] = useState({});

  const { gameName, tagLine, stats, recentMatches: matches, diagnosis } = playerData;
  const recentFive = matches?.slice(0, 5) ?? [];

  return (
    <div className="px-8 py-8 space-y-8 animate-fade-up max-w-5xl">

      {/* ── Player Header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-electric/10 border border-electric/30
                        flex items-center justify-center text-electric font-black text-2xl shrink-0
                        shadow-electric-sm">
          {gameName[0]?.toUpperCase()}
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white leading-none">
            {gameName}
            <span className="text-slate-500 font-normal text-lg ml-2 font-mono">#{tagLine}</span>
          </h2>
          {stats && (
            <p className="text-slate-500 text-sm mt-1 font-mono">
              {stats.gamesPlayed} partidas · campeão principal:{" "}
              <span className="text-electric">{stats.topChampion}</span>
            </p>
          )}
        </div>
        <button
          onClick={() => navigate("/history")}
          className="ml-auto btn-primary flex items-center gap-2 shrink-0"
        >
          <History size={14} />
          Ver Histórico Completo
        </button>
      </div>

      {/* ── Métricas ───────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`card hover-glow flex flex-col gap-3 border ${
            stats.winrate >= 50
              ? "border-emerald-700/30 bg-emerald-950/10"
              : "border-neon-red/20 bg-red-950/10"
          }`}>
            <p className="label-xs flex items-center gap-1.5">
              <TrendingUp size={11} className="text-slate-500" />
              Winrate Recente
            </p>
            <p className={`stat-value ${wrColor(stats.winrate)}`}>{stats.winrate}%</p>
            <p className="text-slate-500 text-xs font-mono">
              {stats.wins}V / {stats.losses}D em {stats.gamesPlayed} partidas
            </p>
          </div>

          <MetricCard
            icon={Crosshair}
            label="KDA Médio"
            value={stats.kda}
            sub={`${stats.avgKills} / ${stats.avgDeaths} / ${stats.avgAssists}`}
            valueClass={kdaColor(stats.kda)}
          />

          <MetricCard
            icon={Coins}
            label="Gold / Minuto"
            value={stats.avgGoldPerMin}
            sub={`média de ${stats.gamesPlayed} partidas`}
            valueClass={stats.avgGoldPerMin >= 350 ? "text-emerald-400" : "text-neon-red"}
          />
        </div>
      )}

      {/* ── 2 colunas: Partidas recentes + Diagnóstico ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Partidas recentes */}
        <div className="card p-0 overflow-hidden hover-glow">
          <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
            <h3 className="label-xs flex items-center gap-2">
              <Swords size={11} />Últimas {recentFive.length} Partidas
            </h3>
            <button
              onClick={() => navigate("/history")}
              className="text-[10px] text-electric/60 hover:text-electric font-mono transition-colors flex items-center gap-1"
            >
              Ver todas <ChevronRight size={10} />
            </button>
          </div>
          <div>
            {recentFive.map(m => (
              <MiniMatchRow
                key={m.matchId}
                match={m}
                onClick={() => navigate(`/match/${m.matchId}`)}
              />
            ))}
          </div>
        </div>

        {/* Diagnóstico */}
        {diagnosis && (
          <div className="card hover-glow space-y-4">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-electric" />
              <h3 className="label-xs">Diagnóstico Principal</h3>
            </div>

            {diagnosis.deathWarning && (
              <div className="flex items-start gap-2.5 bg-yellow-900/20 border border-yellow-700/30
                              rounded-xl px-3 py-2.5 text-yellow-300 text-xs leading-relaxed">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                {diagnosis.deathWarning}
              </div>
            )}

            <div className="bg-navy-950/80 border border-white/5 rounded-xl p-4 space-y-1.5">
              <p className="label-xs text-electric">Problema Principal</p>
              <p className="text-base font-bold text-white">{diagnosis.title}</p>
              <p className="text-slate-400 text-xs leading-relaxed">{diagnosis.text}</p>
            </div>

            {/* Top 2 padrões */}
            {diagnosis.recurringPatterns?.slice(0, 2).map((p, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                <span className="text-yellow-500 shrink-0 mt-0.5">→</span>{p}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Plano de Ação ─────────────────────────────────────────────── */}
      {diagnosis?.plan?.length > 0 && (
        <div className="card hover-glow space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="label-xs flex items-center gap-2">
              <Target size={11} />Plano de Ação
            </h3>
            <span className="text-xs text-slate-600 font-mono">
              {Object.values(checked).filter(Boolean).length}/{diagnosis.plan.length}
            </span>
          </div>
          <div className="bg-navy-950/60 rounded-xl px-4 divide-y divide-white/5">
            {diagnosis.plan.map((task, i) => (
              <ActionItem
                key={i}
                text={task}
                checked={!!checked[i]}
                onToggle={() => setChecked(p => ({ ...p, [i]: !p[i] }))}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Radar de Evolução ─────────────────────────────────────────── */}
      {matches?.length > 0 && (
        <div className="card hover-glow">
          <RadarEvolucao matches={matches} />
        </div>
      )}

      {/* ── Coaching Report ───────────────────────────────────────────── */}
      <CoachingReport riotId={riotId} />
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

// History icon inline (lucide não exporta History diretamente em algumas versões)
function History({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
      <path d="M3 3v5h5"/>
      <path d="M12 7v5l4 2"/>
    </svg>
  );
}

export default function HomeView() {
  const { playerData, loading, error } = usePlayer();

  return (
    <div className="relative min-h-screen">
      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <Loader2 size={32} className="text-electric animate-spin" />
          <p className="text-slate-500 text-sm font-mono">Analisando partidas…</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex items-center justify-center min-h-screen p-8">
          <div className="flex items-start gap-3 bg-neon-red/10 border border-neon-red/30
                          rounded-2xl px-5 py-4 text-neon-red text-sm max-w-md">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {error}
          </div>
        </div>
      )}

      {/* Hero (sem jogador) */}
      {!loading && !error && !playerData && <HeroSection />}

      {/* Dashboard (com jogador) */}
      {!loading && !error && playerData && <Dashboard />}
    </div>
  );
}
