import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  ArrowLeft, Clock, Swords, Crown, Flame, Skull, Shield,
  TrendingUp, TrendingDown, ThumbsUp, ThumbsDown, Loader2,
  AlertCircle, ChevronDown, ChevronUp, Activity, Zap, Target,
  BarChart3, List, Lightbulb, Package,
} from "lucide-react";
import { usePlayer } from "../context/PlayerContext";
import InsightCard from "../components/InsightCard";
import MatchupGrid from "../components/MatchupGrid";
import { analyzeBuild } from "../services/buildAnalyzer";
import { ItemRow } from "../components/ItemDisplay";

// =============================================================================
// MatchDetailView — Página completa de análise pós-game
//
// Rota: /match/:matchId
// Carrega timeline via GET /api/timeline/:matchId?puuid=:puuid
//
// Layout:
//   [Back] + Hero header (resultado + KDA + duração)
//   10 participantes em 2 fileiras (Azul vs Vermelho)
//   Tabs: Insights | Gold Chart | Timeline | Stats
// =============================================================================

// ── Helpers ──────────────────────────────────────────────────────────────────

function kdaColor(k) {
  return k >= 4 ? "text-emerald-400" : k >= 2.5 ? "text-blue-400"
       : k >= 1.5 ? "text-yellow-400" : "text-neon-red";
}

function fmtGold(g) {
  return g >= 1000 ? `${(g / 1000).toFixed(1)}k` : String(g);
}

const LANE_LABEL = {
  TOP: "Top", JUNGLE: "Jungle", MID: "Mid",
  ADC: "ADC", SUPPORT: "Suporte", UNKNOWN: "?",
};

// ── Participant Row ───────────────────────────────────────────────────────────

function ParticipantRow({ p, isPlayer, side }) {
  const alignRight = side === "red";
  const kda = ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2);

  return (
    <div className={`flex items-center gap-2 py-1.5 px-2 rounded-lg
      hover:bg-white/5 transition-colors ${isPlayer ? "bg-electric/5 border border-electric/20" : ""}
      ${alignRight ? "flex-row-reverse" : ""}`}>
      {/* Champion initials */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 border ${
        side === "blue"
          ? "bg-blue-900/50 border-blue-700/50 text-blue-300"
          : "bg-red-900/50 border-red-700/50 text-red-300"
      } ${isPlayer ? "ring-1 ring-electric" : ""}`}>
        {p.championName?.slice(0, 2) ?? "??"}
      </div>
      {/* Name + KDA */}
      <div className={`flex-1 min-w-0 ${alignRight ? "text-right" : ""}`}>
        <p className={`text-xs font-semibold truncate ${isPlayer ? "text-electric" : "text-slate-300"}`}>
          {p.championName}
        </p>
        <p className={`text-[10px] font-mono ${kdaColor(Number(kda))}`}>
          {p.kills}/{p.deaths}/{p.assists}
        </p>
      </div>
      {/* Gold */}
      <p className="text-[10px] font-mono text-yellow-500/70 shrink-0 hidden sm:block">
        {fmtGold(p.goldEarned ?? 0)}
      </p>
    </div>
  );
}

// ── Gold Chart ────────────────────────────────────────────────────────────────

function GoldChart({ goldDiffs, playerTeam }) {
  if (!goldDiffs?.length) return null;

  const positiveColor = "#10b981";
  const negativeColor = "#FF2A2A";

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const val = payload[0]?.value ?? 0;
    return (
      <div className="bg-navy-900 border border-white/15 rounded-xl px-3 py-2 text-xs font-mono shadow-card">
        <p className="text-slate-400 mb-1">Min {label}</p>
        <p className={val >= 0 ? "text-emerald-400" : "text-neon-red"}>
          {val >= 0 ? "+" : ""}{val.toLocaleString("pt-BR")} ouro
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <p className="label-xs flex items-center gap-1.5">
        <BarChart3 size={11} />Gold Diff do Time ({playerTeam === "blue" ? "Azul" : "Vermelho"})
      </p>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={goldDiffs} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="goldPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={positiveColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={positiveColor} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="goldNeg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={negativeColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={negativeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="minute" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false}
                   tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
            <Area
              type="monotone" dataKey="diff"
              stroke={goldDiffs.at(-1)?.diff >= 0 ? positiveColor : negativeColor}
              strokeWidth={2}
              fill={goldDiffs.at(-1)?.diff >= 0 ? "url(#goldPos)" : "url(#goldNeg)"}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Timeline Events ───────────────────────────────────────────────────────────

function describeEvent(ev) {
  switch (ev.type) {
    case "CHAMPION_KILL":
      if (ev.isPlayerDeath) return { color: "text-neon-red",    text: `⚔ Você morreu para ${ev.killerName}` };
      if (ev.isPlayerKill)  return { color: "text-emerald-400", text: `⚔ Você abateu ${ev.victimName}` };
      if (ev.isAllyKill)    return { color: "text-emerald-600", text: `⚔ ${ev.killerName} → ${ev.victimName}` };
      return                       { color: "text-neon-red/70", text: `💀 ${ev.victimName} aliado morreu` };
    case "BARON":
      return { color: ev.isPlayerTeam ? "text-emerald-400" : "text-neon-red",
               text: `🐲 Barão ${ev.isPlayerTeam ? "capturado" : "cedido"}` };
    case "DRAGON":
      return { color: ev.isPlayerTeam ? "text-emerald-400" : "text-neon-red",
               text: `🐉 Dragão ${ev.isPlayerTeam ? "capturado" : "cedido"} (${ev.subType ?? ""})` };
    case "HERALD":
      return { color: "text-purple-400", text: "🪲 Arauto da Fenda" };
    case "TOWER":
      return { color: ev.isPlayerTeam ? "text-emerald-400" : "text-neon-red",
               text: `🏰 Torre ${ev.isPlayerTeam ? "destruída" : "perdida"} (${ev.lane ?? ""})` };
    case "INHIBITOR":
      return { color: ev.isPlayerTeam ? "text-emerald-400" : "text-neon-red",
               text: `🔮 Inibidor ${ev.isPlayerTeam ? "destruído" : "perdido"}` };
    default:
      return { color: "text-slate-400", text: ev.type };
  }
}

function TimelinePanel({ events }) {
  if (!events?.length) return (
    <p className="text-slate-600 text-sm font-mono text-center py-12">Sem eventos registrados.</p>
  );

  const relevant = events.filter(e => e.type !== "CHAMPION_KILL" || e.isPlayerDeath || e.isPlayerKill || e.type.includes("BARON") || e.type.includes("DRAGON"));

  return (
    <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
      {events.map((ev, i) => {
        const { color, text } = describeEvent(ev);
        return (
          <div key={i} className="flex items-start gap-3 py-1.5 px-2 rounded-lg hover:bg-white/5 group">
            <span className="text-[10px] font-mono text-slate-600 shrink-0 w-10 text-right">
              {String(ev.minute).padStart(2, "0")}:{String(ev.second ?? 0).padStart(2, "0")}
            </span>
            <p className={`text-xs leading-relaxed ${color}`}>{text}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Stats Table ───────────────────────────────────────────────────────────────

function StatsTable({ participants, playerPuuid }) {
  const blueTeam = participants.filter(p => p.teamId === 100);
  const redTeam  = participants.filter(p => p.teamId === 200);

  const cols = [
    { label: "Campeão", key: "championName" },
    { label: "KDA", key: "_kda" },
    { label: "CS", key: "_cs" },
    { label: "Dano", key: "damageAbsolute" },
    { label: "Gold", key: "goldEarned" },
    { label: "Visão", key: "visionScore" },
  ];

  function renderTeam(team, header, headerCls) {
    return (
      <div>
        <p className={`label-xs px-3 py-2 border-b border-white/5 ${headerCls}`}>{header}</p>
        {team.map(p => {
          const isPlayer = p.puuid === playerPuuid;
          const kda = ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2);
          const cs = (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0);
          return (
            <div key={p.participantId}
                 className={`grid grid-cols-6 gap-2 px-3 py-2 text-xs font-mono text-slate-400
                             border-b border-white/4 ${isPlayer ? "bg-electric/5 text-electric" : "hover:bg-white/3"}`}>
              <span className="truncate font-semibold text-slate-200">{p.championName}</span>
              <span className={kdaColor(Number(kda))}>{p.kills}/{p.deaths}/{p.assists}</span>
              <span>{cs}</span>
              <span>{(p.damageAbsolute / 1000).toFixed(1)}k</span>
              <span className="text-yellow-500/70">{(p.goldEarned / 1000).toFixed(1)}k</span>
              <span>{p.visionScore ?? 0}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="grid grid-cols-6 gap-2 px-3 py-1 text-[10px] font-mono text-slate-600 uppercase tracking-wider">
        <span>Campeão</span><span>KDA</span><span>CS</span><span>Dano</span><span>Gold</span><span>Visão</span>
      </div>
      {renderTeam(blueTeam, "Time Azul", "text-blue-400")}
      {renderTeam(redTeam,  "Time Vermelho", "text-red-400")}
    </div>
  );
}

// ── Tipping Point Card ────────────────────────────────────────────────────────

function TippingPointCard({ tp }) {
  if (!tp) return null;
  return (
    <InsightCard
      icon="⚠️"
      title="Ponto de Virada"
      body={tp.description}
      type="warning"
      meta={`Min ${tp.minute} · ${Math.abs(tp.goldDeficit).toLocaleString("pt-BR")} de ouro de deficit`}
    />
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MatchDetailView() {
  const { matchId }               = useParams();
  const navigate                  = useNavigate();
  const { playerData, puuid }     = usePlayer();
  const [timeline,    setTimeline] = useState(null);
  const [tlLoading,   setTlLoading]= useState(false);
  const [tlError,     setTlError]  = useState(null);
  const [activeTab,   setActiveTab]= useState("insights");

  // Busca a partida do contexto
  const match = playerData?.recentMatches?.find(m => m.matchId === matchId);

  // Carrega timeline ao montar
  const fetchTimeline = useCallback(async () => {
    if (!matchId || !puuid || timeline) return;
    setTlLoading(true);
    setTlError(null);
    try {
      const { data } = await axios.get(`/api/timeline/${matchId}?puuid=${puuid}`);
      setTimeline(data);
    } catch (err) {
      setTlError(err.response?.data?.error ?? "Erro ao carregar timeline.");
    } finally {
      setTlLoading(false);
    }
  }, [matchId, puuid, timeline]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!playerData) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <p className="text-slate-600 font-mono text-sm">Busque um jogador primeiro.</p>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
        <AlertCircle size={32} className="text-neon-red/60" />
        <p className="text-slate-500 font-mono text-sm">Partida não encontrada nos dados atuais.</p>
        <button onClick={() => navigate("/history")} className="btn-ghost">
          ← Voltar ao histórico
        </button>
      </div>
    );
  }

  const { win, champion, kills, deaths, assists, kda, durationMin, analysis, participants } = match;
  const blueTeam = participants?.filter(p => p.teamId === 100) ?? [];
  const redTeam  = participants?.filter(p => p.teamId === 200) ?? [];

  // Build insights cards from analysis
  const insightCards = [];
  if (analysis?.positives?.length) {
    insightCards.push({
      icon: "✅", title: "O que funcionou", type: "success",
      body: analysis.positives.join(" · "),
    });
  }
  if (analysis?.negatives?.length) {
    insightCards.push({
      icon: "⚠️", title: "O que pode melhorar", type: "warning",
      body: analysis.negatives.slice(0, 3).join(" · "),
    });
  }
  insightCards.push({
    icon: "🎯", title: "Veredito", type: "neutral",
    body: analysis?.verdict ?? "—",
    meta: `CS/m ${analysis?.csPerMin} · G/m ${analysis?.goldPerMin} · KP ${analysis?.killParticipation}%`,
  });
  if (timeline?.tippingPoint) {
    insightCards.push({
      icon: "⚡", title: "Ponto de Virada", type: "warning",
      body: timeline.tippingPoint.description,
      meta: `Minuto ${timeline.tippingPoint.minute}`,
    });
  }
  if (timeline?.laneAnalysis) {
    insightCards.push({
      icon: "⚔️", title: `Lane vs ${timeline.opponentChampion ?? "oponente"}`, type: "info",
      body: timeline.laneAnalysis,
    });
  }

  const TABS = [
    { id: "insights", label: "Insights",    icon: Lightbulb },
    { id: "gold",     label: "Gold Chart",  icon: BarChart3 },
    { id: "timeline", label: "Timeline",    icon: Activity  },
    { id: "stats",    label: "Stats",       icon: List      },
  ];

  return (
    <div className="px-6 py-6 space-y-6 max-w-6xl animate-fade-up">

      {/* ── Back + breadcrumb ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/history")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={15} />
          Histórico
        </button>
        <span className="text-slate-700">/</span>
        <span className="text-xs font-mono text-slate-600 truncate">{matchId}</span>
      </div>

      {/* ── HERO HEADER ─────────────────────────────────────────────────── */}
      <div className={`card border-l-4 ${win ? "border-l-emerald-500" : "border-l-neon-red"}
                       ${win ? "bg-emerald-950/10" : "bg-red-950/8"}`}>
        <div className="flex items-center gap-6 flex-wrap">
          {/* Result */}
          <div className="text-center shrink-0">
            <p className={`text-5xl font-black ${win ? "text-emerald-400" : "text-neon-red"}`}>
              {win ? "V" : "D"}
            </p>
            <p className={`text-xs font-mono mt-1 ${win ? "text-emerald-600" : "text-neon-red/60"}`}>
              {win ? "VITÓRIA" : "DERROTA"}
            </p>
          </div>

          {/* Champion */}
          <div className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center
                          text-2xl font-black shrink-0 ${
                            win ? "bg-emerald-900/30 border-emerald-700/50 text-emerald-300"
                                : "bg-red-900/30 border-red-700/50 text-red-300"
                          }`}>
            {champion.slice(0, 2)}
          </div>

          {/* Stats */}
          <div className="space-y-1">
            <p className="text-white font-bold text-xl leading-none">{champion}</p>
            <p className={`text-2xl font-black font-mono ${kdaColor(kda)}`}>
              {kills} <span className="text-slate-600">/</span> {deaths} <span className="text-slate-600">/</span> {assists}
            </p>
            <p className="text-xs font-mono text-slate-500">KDA {kda}</p>
          </div>

          {/* Secondary stats */}
          <div className="flex gap-6 ml-4 flex-wrap">
            {[
              { label: "CS/min",      value: analysis?.csPerMin,          color: analysis?.csPerMin >= 7 ? "text-emerald-400" : analysis?.csPerMin < 5 ? "text-neon-red" : "text-slate-300" },
              { label: "Gold/min",    value: analysis?.goldPerMin,        color: analysis?.goldPerMin >= 400 ? "text-yellow-400" : "text-slate-300" },
              { label: "Duração",     value: `${durationMin}m`,           color: "text-slate-300" },
              { label: "KP",          value: analysis?.killParticipation ? `${analysis.killParticipation}%` : "—", color: "text-slate-300" },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <p className={`text-lg font-bold font-mono ${color}`}>{value ?? "—"}</p>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider font-mono">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 10 Participantes ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Blue Team */}
        <div className="card p-0 overflow-hidden border-t-2 border-t-blue-600/60">
          <p className="label-xs px-4 py-2.5 border-b border-white/5 text-blue-400">
            Time Azul
          </p>
          <div className="px-3 py-2 space-y-0.5">
            {blueTeam.map(p => (
              <ParticipantRow key={p.participantId} p={p}
                isPlayer={p.puuid === puuid} side="blue" />
            ))}
          </div>
        </div>
        {/* Red Team */}
        <div className="card p-0 overflow-hidden border-t-2 border-t-neon-red/60">
          <p className="label-xs px-4 py-2.5 border-b border-white/5 text-red-400">
            Time Vermelho
          </p>
          <div className="px-3 py-2 space-y-0.5">
            {redTeam.map(p => (
              <ParticipantRow key={p.participantId} p={p}
                isPlayer={p.puuid === puuid} side="red" />
            ))}
          </div>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-navy-900 border border-white/8 rounded-xl p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg
                        text-xs font-semibold transition-all ${
              activeTab === id
                ? "bg-electric/15 border border-electric/30 text-electric"
                : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
            }`}
          >
            <Icon size={12} className="hidden sm:block" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────────── */}
      <div className="card min-h-64">
        {/* Insights */}
        {activeTab === "insights" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {insightCards.map((c, i) => (
              <InsightCard key={i} {...c} />
            ))}
          </div>
        )}

        {/* Gold Chart */}
        {activeTab === "gold" && (
          tlLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-500 text-sm">
              <Loader2 size={16} className="animate-spin text-electric" />Carregando dados…
            </div>
          ) : tlError ? (
            <p className="text-neon-red/70 text-sm font-mono text-center py-12">{tlError}</p>
          ) : timeline?.goldDiffs?.length ? (
            <GoldChart goldDiffs={timeline.goldDiffs} playerTeam={timeline.playerTeam} />
          ) : (
            <p className="text-slate-600 text-sm font-mono text-center py-12">Dados de gold indisponíveis.</p>
          )
        )}

        {/* Timeline */}
        {activeTab === "timeline" && (
          tlLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-500 text-sm">
              <Loader2 size={16} className="animate-spin text-electric" />Carregando timeline…
            </div>
          ) : (
            <TimelinePanel events={timeline?.events ?? []} />
          )
        )}

        {/* Stats */}
        {activeTab === "stats" && (
          <StatsTable participants={participants ?? []} playerPuuid={puuid} />
        )}
      </div>

      {/* ── Matchup Analysis (se disponível) ────────────────────────────── */}
      {match.participants?.length > 0 && (
        <div className="card space-y-4">
          <h3 className="label-xs flex items-center gap-2">
            <Swords size={11} />Comparativo da Partida
          </h3>
          <MatchupGrid participants={match.participants} puuid={puuid} />
        </div>
      )}
    </div>
  );
}
