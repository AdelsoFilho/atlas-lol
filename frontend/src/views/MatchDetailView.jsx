import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  ArrowLeft, Swords, Loader2, AlertCircle,
  Activity, BarChart3, List, Lightbulb, RefreshCw,
} from "lucide-react";
import { usePlayer } from "../context/PlayerContext";
import InsightCard from "../components/InsightCard";
import MatchupGrid from "../components/MatchupGrid";

// =============================================================================
// MatchDetailView — Página completa de análise pós-game
//
// Rota: /match/:matchId
// Dados estáticos vêm do PlayerContext (recentMatches — sempre disponíveis).
// Timeline é carregada lazy via GET /api/timeline/:matchId?puuid=:puuid
//
// Estados:
//   playerData null + loading  → SkeletonLoader
//   playerData null + !loading → NoPlayerState
//   match null                 → MatchNotFoundState
//   match found                → Renderização completa
// =============================================================================

// ── Helpers ───────────────────────────────────────────────────────────────────

function kdaColor(k) {
  return k >= 4 ? "text-emerald-400"
       : k >= 2.5 ? "text-blue-400"
       : k >= 1.5 ? "text-yellow-400"
       : "text-neon-red";
}

function fmtGold(g) {
  return g >= 1000 ? `${(g / 1000).toFixed(1)}k` : String(g);
}

// ── Skeleton Loader ───────────────────────────────────────────────────────────

function MatchDetailSkeleton() {
  const Pulse = ({ cls }) => (
    <div className={`bg-navy-800 rounded-xl animate-pulse ${cls}`} />
  );

  return (
    <div className="px-6 py-6 space-y-6 max-w-6xl">
      {/* Back */}
      <Pulse cls="h-5 w-28" />

      {/* Hero card */}
      <div className="card">
        <div className="flex items-center gap-6">
          <Pulse cls="h-16 w-12" />
          <Pulse cls="h-16 w-16 rounded-2xl" />
          <div className="space-y-2 flex-1">
            <Pulse cls="h-6 w-32" />
            <Pulse cls="h-8 w-48" />
            <Pulse cls="h-4 w-24" />
          </div>
          <div className="flex gap-6">
            {[1,2,3,4].map(i => (
              <div key={i} className="space-y-1">
                <Pulse cls="h-6 w-12" />
                <Pulse cls="h-3 w-10" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Teams */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card space-y-2">
          <Pulse cls="h-4 w-20 mb-3" />
          {[1,2,3,4,5].map(i => <Pulse key={i} cls="h-10 w-full" />)}
        </div>
        <div className="card space-y-2">
          <Pulse cls="h-4 w-24 mb-3" />
          {[1,2,3,4,5].map(i => <Pulse key={i} cls="h-10 w-full" />)}
        </div>
      </div>

      {/* Tabs */}
      <Pulse cls="h-12 w-full" />

      {/* Content */}
      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Pulse key={i} cls="h-32" />)}
        </div>
      </div>
    </div>
  );
}

// ── Participant Row ───────────────────────────────────────────────────────────

function ParticipantRow({ p, isPlayer, side }) {
  const alignRight = side === "red";
  const kda = ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2);

  return (
    <div className={`flex items-center gap-2 py-1.5 px-2 rounded-lg
      hover:bg-white/5 transition-colors
      ${isPlayer ? "bg-electric/5 border border-electric/20" : ""}
      ${alignRight ? "flex-row-reverse" : ""}`}>
      {/* Champion initials */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 border
        ${side === "blue"
          ? "bg-blue-900/50 border-blue-700/50 text-blue-300"
          : "bg-red-900/50 border-red-700/50 text-red-300"
        }
        ${isPlayer ? "ring-1 ring-electric" : ""}`}>
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
        <BarChart3 size={11} />
        Gold Diff do Time ({playerTeam === "blue" ? "Azul" : "Vermelho"})
      </p>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={goldDiffs} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="goldPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={positiveColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={positiveColor} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="goldNeg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={negativeColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={negativeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="minute" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false}
                   tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
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
    <p className="text-slate-600 text-sm font-mono text-center py-12">
      Sem eventos registrados.
    </p>
  );

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

  function renderTeam(team, header, headerCls) {
    return (
      <div>
        <p className={`label-xs px-3 py-2 border-b border-white/5 ${headerCls}`}>{header}</p>
        {team.map(p => {
          const isPlayer = p.puuid === playerPuuid;
          const kda      = ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2);
          const cs       = (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0);
          return (
            <div key={p.participantId}
                 className={`grid grid-cols-6 gap-2 px-3 py-2 text-xs font-mono text-slate-400
                             border-b border-white/[0.04] last:border-0
                             ${isPlayer ? "bg-electric/5 text-electric" : "hover:bg-white/[0.03]"}`}>
              <span className="truncate font-semibold text-slate-200">{p.championName}</span>
              <span className={kdaColor(Number(kda))}>{p.kills}/{p.deaths}/{p.assists}</span>
              <span>{cs}</span>
              <span>{((p.damageAbsolute ?? p.totalDamage ?? 0) / 1000).toFixed(1)}k</span>
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
      <div className="grid grid-cols-6 gap-2 px-3 py-1 text-[10px] font-mono text-slate-600 uppercase tracking-wider">
        <span>Campeão</span><span>KDA</span><span>CS</span>
        <span>Dano</span><span>Gold</span><span>Visão</span>
      </div>
      {renderTeam(blueTeam, "Time Azul",      "text-blue-400")}
      {renderTeam(redTeam,  "Time Vermelho",  "text-red-400")}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MatchDetailView() {
  const { matchId }                       = useParams();
  const navigate                          = useNavigate();
  const { playerData, puuid, loading }    = usePlayer();
  const [timeline,    setTimeline]        = useState(null);
  const [tlLoading,   setTlLoading]       = useState(false);
  const [tlError,     setTlError]         = useState(null);
  const [activeTab,   setActiveTab]       = useState("insights");

  // ── Debug log ────────────────────────────────────────────────────────────
  console.log(
    "[MatchDetailView] matchId:", matchId,
    "| puuid:", puuid,
    "| playerData:", playerData ? `${playerData.gameName}#${playerData.tagLine}` : null,
    "| totalMatches:", playerData?.recentMatches?.length ?? 0,
  );

  // Busca a partida no contexto (sem fetch adicional — dados já estão carregados)
  const match = playerData?.recentMatches?.find(m => m.matchId === matchId) ?? null;

  console.log("[MatchDetailView] match lookup →", match
    ? `${match.champion} ${match.win ? "V" : "D"} ${match.kills}/${match.deaths}/${match.assists}`
    : "NÃO ENCONTRADA"
  );

  // ── Carrega timeline ao montar (lazy) ────────────────────────────────────
  const fetchTimeline = useCallback(async () => {
    if (!matchId || !puuid) {
      if (!puuid) console.warn("[MatchDetailView] puuid ausente — timeline não carregará");
      return;
    }
    if (timeline) return; // já carregado

    setTlLoading(true);
    setTlError(null);
    try {
      const { data } = await axios.get(`/api/timeline/${matchId}?puuid=${puuid}`);
      console.log("[MatchDetailView] timeline carregada:", {
        events: data.events?.length,
        goldDiffs: data.goldDiffs?.length,
        tippingPoint: data.tippingPoint?.minute ?? null,
        lane: data.lane,
        opponentChampion: data.opponentChampion,
      });
      setTimeline(data);
    } catch (err) {
      const msg = err.response?.data?.error ?? "Erro ao carregar timeline.";
      console.error("[MatchDetailView] timeline erro:", msg);
      setTlError(msg);
    } finally {
      setTlLoading(false);
    }
  }, [matchId, puuid, timeline]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  // ── Guards ────────────────────────────────────────────────────────────────

  // 1. Buscando jogador → esqueleto
  if (loading && !playerData) {
    return <MatchDetailSkeleton />;
  }

  // 2. Sem jogador carregado → instrução clara
  if (!playerData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
        <div className="w-14 h-14 rounded-2xl bg-navy-800 border border-white/10
                        flex items-center justify-center">
          <Swords size={24} className="text-slate-600" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-slate-300 font-semibold">Nenhum jogador carregado</p>
          <p className="text-slate-600 text-sm">Use a barra lateral para buscar um jogador.</p>
        </div>
        <button onClick={() => navigate("/")} className="btn-primary">
          Ir para a busca
        </button>
      </div>
    );
  }

  // 3. Partida não encontrada nos dados locais
  if (!match) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
        <AlertCircle size={32} className="text-neon-red/60" />
        <div className="text-center space-y-1">
          <p className="text-slate-300 font-semibold">Partida não encontrada</p>
          <p className="text-slate-600 text-xs font-mono break-all max-w-xs">{matchId}</p>
          <p className="text-slate-600 text-sm mt-2">
            O ID não está nos dados atuais de{" "}
            <span className="text-electric">{playerData.gameName}#{playerData.tagLine}</span>.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate("/history")} className="btn-ghost">
            ← Histórico
          </button>
          <button onClick={() => navigate("/")} className="btn-primary">
            Nova busca
          </button>
        </div>
      </div>
    );
  }

  // ── Dados da partida ──────────────────────────────────────────────────────

  const { win, champion, kills, deaths, assists, kda, durationMin, analysis, participants } = match;
  const blueTeam = participants?.filter(p => p.teamId === 100) ?? [];
  const redTeam  = participants?.filter(p => p.teamId === 200) ?? [];

  // ── Insights cards ────────────────────────────────────────────────────────

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
    meta: `CS/m ${analysis?.csPerMin ?? "—"} · G/m ${analysis?.goldPerMin ?? "—"} · KP ${
      analysis?.killParticipation != null ? `${analysis.killParticipation}%` : "—"
    }`,
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

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const TABS = [
    { id: "insights", label: "Insights",   icon: Lightbulb },
    { id: "gold",     label: "Gold Chart", icon: BarChart3 },
    { id: "timeline", label: "Timeline",   icon: Activity  },
    { id: "stats",    label: "Stats",      icon: List      },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-6 py-6 space-y-6 max-w-6xl animate-fade-up">

      {/* ── Breadcrumb ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/history")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={15} />
          Histórico
        </button>
        <span className="text-slate-700">/</span>
        <span className="text-xs font-mono text-slate-600 truncate max-w-xs">{matchId}</span>
      </div>

      {/* ── HERO HEADER ──────────────────────────────────────────────────── */}
      <div className={`card border-l-4
        ${win ? "border-l-emerald-500 bg-emerald-950/10" : "border-l-neon-red bg-red-950/10"}`}>
        <div className="flex items-center gap-6 flex-wrap">
          {/* Result badge */}
          <div className="text-center shrink-0">
            <p className={`text-5xl font-black ${win ? "text-emerald-400" : "text-neon-red"}`}>
              {win ? "V" : "D"}
            </p>
            <p className={`text-xs font-mono mt-1 ${win ? "text-emerald-600" : "text-neon-red/60"}`}>
              {win ? "VITÓRIA" : "DERROTA"}
            </p>
          </div>

          {/* Champion circle */}
          <div className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center
                          text-2xl font-black shrink-0
                          ${win
                            ? "bg-emerald-900/30 border-emerald-700/50 text-emerald-300"
                            : "bg-red-900/30 border-red-700/50 text-red-300"
                          }`}>
            {champion.slice(0, 2)}
          </div>

          {/* Champion + KDA */}
          <div className="space-y-1">
            <p className="text-white font-bold text-xl leading-none">{champion}</p>
            <p className={`text-2xl font-black font-mono ${kdaColor(kda)}`}>
              {kills}
              <span className="text-slate-600"> / </span>
              {deaths}
              <span className="text-slate-600"> / </span>
              {assists}
            </p>
            <p className="text-xs font-mono text-slate-500">KDA {kda}</p>
          </div>

          {/* Secondary stats */}
          <div className="flex gap-6 ml-4 flex-wrap">
            {[
              {
                label: "CS/min",
                value: analysis?.csPerMin ?? "—",
                color: analysis?.csPerMin >= 7 ? "text-emerald-400"
                     : analysis?.csPerMin < 5  ? "text-neon-red"
                     : "text-slate-300",
              },
              {
                label: "Gold/min",
                value: analysis?.goldPerMin ?? "—",
                color: analysis?.goldPerMin >= 400 ? "text-yellow-400" : "text-slate-300",
              },
              {
                label: "Duração",
                value: `${durationMin}m`,
                color: "text-slate-300",
              },
              {
                label: "KP",
                value: analysis?.killParticipation != null
                  ? `${analysis.killParticipation}%` : "—",
                color: "text-slate-300",
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
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
          <p className="label-xs px-4 py-2.5 border-b border-white/5 text-blue-400">Time Azul</p>
          <div className="px-3 py-2 space-y-0.5">
            {blueTeam.length > 0
              ? blueTeam.map(p => (
                  <ParticipantRow key={p.participantId} p={p}
                    isPlayer={p.puuid === puuid} side="blue" />
                ))
              : <p className="text-slate-600 text-xs text-center py-4 font-mono">Sem dados</p>
            }
          </div>
        </div>
        {/* Red Team */}
        <div className="card p-0 overflow-hidden border-t-2 border-t-neon-red/60">
          <p className="label-xs px-4 py-2.5 border-b border-white/5 text-red-400">Time Vermelho</p>
          <div className="px-3 py-2 space-y-0.5">
            {redTeam.length > 0
              ? redTeam.map(p => (
                  <ParticipantRow key={p.participantId} p={p}
                    isPlayer={p.puuid === puuid} side="red" />
                ))
              : <p className="text-slate-600 text-xs text-center py-4 font-mono">Sem dados</p>
            }
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
                        text-xs font-semibold transition-all
                        ${activeTab === id
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
            {insightCards.length > 0
              ? insightCards.map((c, i) => <InsightCard key={i} {...c} />)
              : <p className="text-slate-600 text-sm font-mono col-span-3 text-center py-8">
                  Nenhum dado de análise disponível.
                </p>
            }
          </div>
        )}

        {/* Gold Chart */}
        {activeTab === "gold" && (
          tlLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-500 text-sm">
              <Loader2 size={16} className="animate-spin text-electric" />
              Carregando dados de gold…
            </div>
          ) : tlError ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-neon-red/70 text-sm font-mono">{tlError}</p>
              <button
                onClick={() => { setTlError(null); setTimeline(null); }}
                className="btn-ghost flex items-center gap-1.5 text-xs"
              >
                <RefreshCw size={12} />Tentar Novamente
              </button>
            </div>
          ) : !puuid ? (
            <p className="text-slate-600 text-sm font-mono text-center py-12">
              PUUID não disponível — refaça a busca do jogador.
            </p>
          ) : timeline?.goldDiffs?.length ? (
            <GoldChart goldDiffs={timeline.goldDiffs} playerTeam={timeline.playerTeam} />
          ) : (
            <p className="text-slate-600 text-sm font-mono text-center py-12">
              Dados de gold indisponíveis para esta partida.
            </p>
          )
        )}

        {/* Timeline */}
        {activeTab === "timeline" && (
          tlLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-500 text-sm">
              <Loader2 size={16} className="animate-spin text-electric" />
              Carregando timeline…
            </div>
          ) : tlError ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-neon-red/70 text-sm font-mono">{tlError}</p>
              <button
                onClick={() => { setTlError(null); setTimeline(null); }}
                className="btn-ghost flex items-center gap-1.5 text-xs"
              >
                <RefreshCw size={12} />Tentar Novamente
              </button>
            </div>
          ) : (
            <TimelinePanel events={timeline?.events ?? []} />
          )
        )}

        {/* Stats */}
        {activeTab === "stats" && (
          participants?.length > 0 ? (
            <StatsTable participants={participants} playerPuuid={puuid} />
          ) : (
            <p className="text-slate-600 text-sm font-mono text-center py-8">
              Dados dos participantes indisponíveis.
            </p>
          )
        )}
      </div>

      {/* ── Matchup Analysis ─────────────────────────────────────────────── */}
      {participants?.length > 0 && (
        <div className="card space-y-4">
          <h3 className="label-xs flex items-center gap-2">
            <Swords size={11} />Comparativo da Partida
          </h3>
          <MatchupGrid participants={participants} puuid={puuid} />
        </div>
      )}
    </div>
  );
}
