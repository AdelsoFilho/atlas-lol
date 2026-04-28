import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  History, Search, Filter, ChevronRight, Clock, TrendingUp,
  TrendingDown, Minus, Swords, AlertCircle,
} from "lucide-react";
import { usePlayer } from "../context/PlayerContext";
import MatchCard from "../components/MatchCard";

// =============================================================================
// HistoryView — Histórico completo de partidas
//
// · Lista vertical de MatchCards com nova identidade visual
// · Filtros: Todas | Vitórias | Derrotas | Por campeão
// · Clique no card → navega para /match/:matchId
// =============================================================================

function EmptyState() {
  const { search, loading } = usePlayer();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-navy-800 border border-white/8
                      flex items-center justify-center">
        <History size={28} className="text-slate-600" />
      </div>
      <div>
        <p className="text-slate-400 text-base font-semibold">Nenhum jogador selecionado</p>
        <p className="text-slate-600 text-sm mt-1">
          Use a barra lateral para buscar um jogador.
        </p>
      </div>
    </div>
  );
}

// ── Filtro de campeões ────────────────────────────────────────────────────────

function ChampionFilter({ matches, value, onChange }) {
  const champs = useMemo(() => {
    const counts = {};
    matches.forEach(m => { counts[m.champion] = (counts[m.champion] ?? 0) + 1; });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([c]) => c);
  }, [matches]);

  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => onChange("")}
        className={`text-xs px-3 py-1.5 rounded-full border transition-all font-mono ${
          !value
            ? "bg-electric/15 border-electric/40 text-electric"
            : "border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20"
        }`}
      >
        Todos
      </button>
      {champs.map(c => (
        <button
          key={c}
          onClick={() => onChange(c === value ? "" : c)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-all font-mono ${
            value === c
              ? "bg-electric/15 border-electric/40 text-electric"
              : "border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

// ── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ matches }) {
  const wins   = matches.filter(m => m.win).length;
  const losses = matches.length - wins;
  const wr     = matches.length ? Math.round((wins / matches.length) * 100) : 0;
  const avgKda = matches.length
    ? (matches.reduce((s, m) => s + m.kda, 0) / matches.length).toFixed(2)
    : "0.00";

  const trend = wins > losses
    ? { icon: TrendingUp,   cls: "text-emerald-400" }
    : wins === losses
      ? { icon: Minus,      cls: "text-slate-400"   }
      : { icon: TrendingDown, cls: "text-neon-red"  };

  return (
    <div className="flex items-center gap-4 px-5 py-3 bg-navy-900 border border-white/8
                    rounded-xl text-sm font-mono">
      <trend.icon size={14} className={trend.cls} />
      <span className={`font-bold ${wr >= 50 ? "text-emerald-400" : "text-neon-red"}`}>
        {wr}% WR
      </span>
      <span className="text-slate-600">·</span>
      <span className="text-emerald-500">{wins}V</span>
      <span className="text-slate-600">/</span>
      <span className="text-neon-red">{losses}D</span>
      <span className="text-slate-600">·</span>
      <span className="text-slate-400">KDA médio {avgKda}</span>
      <span className="text-slate-600 ml-auto text-xs">{matches.length} partidas</span>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function HistoryView() {
  const { playerData, puuid } = usePlayer();
  const navigate = useNavigate();
  const [filter,   setFilter]   = useState("all");   // "all" | "wins" | "losses"
  const [champFilter, setChampFilter] = useState("");

  if (!playerData) return <EmptyState />;

  const { recentMatches: matches = [], gameName, tagLine } = playerData;

  const filtered = useMemo(() => {
    let r = matches;
    if (filter === "wins")   r = r.filter(m => m.win);
    if (filter === "losses") r = r.filter(m => !m.win);
    if (champFilter)         r = r.filter(m => m.champion === champFilter);
    return r;
  }, [matches, filter, champFilter]);

  return (
    <div className="px-8 py-8 space-y-6 max-w-5xl animate-fade-up">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <History size={20} className="text-electric" />
        <div>
          <h1 className="text-xl font-bold text-white">Histórico de Partidas</h1>
          <p className="text-slate-500 text-xs font-mono mt-0.5">
            {gameName}#{tagLine} · últimas {matches.length} partidas
          </p>
        </div>
      </div>

      {/* ── Summary bar ─────────────────────────────────────────────────── */}
      {filtered.length > 0 && <SummaryBar matches={filtered} />}

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Result filter */}
        <div className="flex items-center gap-2">
          <Filter size={12} className="text-slate-600" />
          <div className="flex gap-1.5">
            {["all", "wins", "losses"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                  filter === f
                    ? f === "wins"   ? "bg-emerald-900/40 border-emerald-700/50 text-emerald-300"
                    : f === "losses" ? "bg-neon-red/10 border-neon-red/30 text-neon-red"
                    :                  "bg-electric/15 border-electric/40 text-electric"
                    : "border-white/10 text-slate-500 hover:text-slate-300"
                }`}
              >
                {f === "all" ? "Todas" : f === "wins" ? "Vitórias" : "Derrotas"}
              </button>
            ))}
          </div>
        </div>

        {/* Champion filter */}
        <ChampionFilter matches={matches} value={champFilter} onChange={setChampFilter} />
      </div>

      {/* ── Lista de partidas ────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-600 font-mono text-sm">
          Nenhuma partida com esse filtro.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((match, i) => (
            <MatchCard
              key={match.matchId}
              match={match}
              index={i}
              onClick={() => navigate(`/match/${match.matchId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
