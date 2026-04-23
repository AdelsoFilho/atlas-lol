import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  X, Loader2, AlertCircle, Clock, Activity, Users,
  Swords, Crown, Flame, Shield, Skull, TrendingUp, TrendingDown,
  ThumbsUp, ThumbsDown, TriangleAlert, Crosshair, Coins,
  ChevronRight, Bot, Lightbulb, Target, Zap,
  Package, ShieldAlert, ShieldCheck, Info,
} from "lucide-react";
import MatchupGrid from "./MatchupGrid";
import { analyzeBuild } from "../services/buildAnalyzer";
import { ItemRow } from "./ItemDisplay";

// =============================================================================
// HELPERS
// =============================================================================

const LANE_LABEL = {
  TOP: "Top",  JUNGLE: "Jungle",  MID: "Mid",
  ADC: "ADC",  SUPPORT: "Suporte",  UNKNOWN: "?",
};

const LANE_COLOR = {
  TOP:     "text-orange-400  bg-orange-900/30  border-orange-700/40",
  JUNGLE:  "text-green-400   bg-green-900/30   border-green-700/40",
  MID:     "text-blue-400    bg-blue-900/30    border-blue-700/40",
  ADC:     "text-purple-400  bg-purple-900/30  border-purple-700/40",
  SUPPORT: "text-teal-400    bg-teal-900/30    border-teal-700/40",
  UNKNOWN: "text-gray-400    bg-gray-800/30    border-gray-700/40",
};

function kdaColor(k) {
  return k >= 4 ? "text-emerald-400" : k >= 2.5 ? "text-blue-400" : k >= 1.5 ? "text-yellow-400" : "text-red-400";
}

// Formata um evento para exibição humana
function describeEvent(ev) {
  switch (ev.type) {
    case "CHAMPION_KILL":
      if (ev.isPlayerDeath) return { icon: Skull,  color: "text-red-400",     text: `Você morreu para ${ev.killerName}` };
      if (ev.isPlayerKill)  return { icon: Swords, color: "text-emerald-400", text: `Você matou ${ev.victimName}` };
      if (ev.isAllyKill)    return { icon: Swords, color: "text-emerald-600", text: `${ev.killerName} matou ${ev.victimName}` };
      return                       { icon: Skull,  color: "text-red-700",     text: `${ev.victimName} aliado morreu` };
    case "BARON":
      return ev.isPlayerTeam
        ? { icon: Crown,  color: "text-purple-300", text: "Barão capturado ✅" }
        : { icon: Crown,  color: "text-purple-500", text: "Barão perdido ❌" };
    case "DRAGON":
      if (ev.subType?.includes("ELDER"))
        return ev.isPlayerTeam
          ? { icon: Flame,  color: "text-amber-300", text: "Dragão Ancião capturado ✅" }
          : { icon: Flame,  color: "text-amber-500", text: "Dragão Ancião PERDIDO ❌" };
      return ev.isPlayerTeam
        ? { icon: Flame,  color: "text-orange-300", text: "Dragão capturado ✅" }
        : { icon: Flame,  color: "text-orange-500", text: "Dragão perdido ❌" };
    case "HERALD":
      return ev.isPlayerTeam
        ? { icon: Shield, color: "text-teal-300",  text: "Herald capturado ✅" }
        : { icon: Shield, color: "text-teal-500",  text: "Herald perdido ❌" };
    case "TOWER":
      return ev.isPlayerTeam
        ? { icon: Shield, color: "text-blue-300",  text: `Torre ${ev.lane ?? ""} destruída ✅` }
        : { icon: Shield, color: "text-red-400",   text: `Torre ${ev.lane ?? ""} perdida ❌` };
    case "INHIBITOR":
      return ev.isPlayerTeam
        ? { icon: Shield, color: "text-blue-200",  text: "Inibidor destruído ✅" }
        : { icon: Shield, color: "text-red-300",   text: "Inibidor perdido ❌" };
    default:
      return { icon: Activity, color: "text-gray-500", text: ev.type };
  }
}

// =============================================================================
// CUSTOM RECHARTS TOOLTIP
// =============================================================================

function GoldDiffTooltip({ active, payload, label, events, isLane, opponentChampion }) {
  if (!active || !payload?.length) return null;

  const minute  = Number(label);
  const diff    = payload[0]?.value ?? 0;
  const isAhead = diff >= 0;

  // Filtra eventos nesse minuto (exatamente, ±0)
  const minuteEvents = (events ?? []).filter(e => e.minute === minute).slice(0, 5);

  return (
    <div className="bg-[#0f1626] border border-white/15 rounded-xl shadow-2xl px-3.5 py-3 min-w-[180px] text-xs space-y-2">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-gray-400 font-medium">Minuto {minute}</span>
        <span className={`font-bold ${isAhead ? "text-emerald-400" : "text-red-400"}`}>
          {isAhead ? "+" : ""}{diff.toLocaleString("pt-BR")} g
        </span>
      </div>

      {/* Contexto do gráfico 1v1 */}
      {isLane && opponentChampion && (
        <p className="text-gray-600 leading-none">vs {opponentChampion}</p>
      )}

      {/* Eventos no minuto */}
      {minuteEvents.length > 0 && (
        <div className="border-t border-white/10 pt-2 space-y-1.5">
          {minuteEvents.map((ev, i) => {
            const { icon: Icon, color, text } = describeEvent(ev);
            return (
              <p key={i} className={`flex items-center gap-1.5 leading-snug ${color}`}>
                <Icon size={10} className="shrink-0" />{text}
              </p>
            );
          })}
        </div>
      )}

      {/* Nenhum evento */}
      {minuteEvents.length === 0 && (
        <p className="text-gray-700 italic">Sem eventos neste minuto</p>
      )}
    </div>
  );
}

// =============================================================================
// GRÁFICO GOLD DIFF INTERATIVO (Recharts)
// =============================================================================

function GoldAreaChart({ data, events, tippingPoint, onMinuteHover, isLane = false, opponentChampion }) {
  const yDomain = useMemo(() => {
    if (!data?.length) return [-1000, 1000];
    const maxAbs = Math.max(500, ...data.map(d => Math.abs(d.diff))) * 1.1;
    return [-maxAbs, maxAbs];         // Domínio simétrico: zero sempre a 50% da altura
  }, [data]);

  const chartData = useMemo(
    () => (data ?? []).map(d => ({ minute: d.minute, diff: d.diff })),
    [data]
  );

  const renderTooltip = useCallback(
    (props) => (
      <GoldDiffTooltip
        {...props}
        events={events}
        isLane={isLane}
        opponentChampion={opponentChampion}
      />
    ),
    [events, isLane, opponentChampion]
  );

  const handleMouseMove = useCallback((state) => {
    if (state?.isTooltipActive && state.activeLabel !== undefined) {
      onMinuteHover?.(Number(state.activeLabel));
    }
  }, [onMinuteHover]);

  const handleMouseLeave = useCallback(() => {
    onMinuteHover?.(null);
  }, [onMinuteHover]);

  if (!data?.length) return (
    <div className="flex items-center justify-center h-48 text-gray-600 text-sm">
      Dados indisponíveis
    </div>
  );

  const lastDiff = data[data.length - 1]?.diff ?? 0;

  return (
    <div className="space-y-1">
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {/* Gradiente com split no zero (domínio simétrico → zero a 50%) */}
            <linearGradient id={isLane ? "laneGrad" : "goldGrad"} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#10b981" stopOpacity="0.55" />
              <stop offset="46%"  stopColor="#10b981" stopOpacity="0.06" />
              <stop offset="54%"  stopColor="#ef4444" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.55" />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />

          <XAxis
            dataKey="minute"
            tick={{ fontSize: 10, fill: "#6b7280" }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
            interval="preserveStartEnd"
            label={{ value: "min", position: "insideRight", offset: 4, dy: 14, fontSize: 9, fill: "#4b5563" }}
          />
          <YAxis
            domain={yDomain}
            tickFormatter={(v) => `${v >= 0 ? "+" : ""}${(v / 1000).toFixed(1)}k`}
            tick={{ fontSize: 10, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            width={44}
          />

          <Tooltip
            content={renderTooltip}
            cursor={{ stroke: "#60a5fa", strokeWidth: 1.5, strokeDasharray: "4 3" }}
          />

          {/* Linha do zero */}
          <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />

          {/* Linha do Tipping Point */}
          {tippingPoint && (
            <ReferenceLine
              x={tippingPoint.minute}
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="5 3"
              label={{
                value: `⚡ ${tippingPoint.minute}m`,
                position: "insideTopLeft",
                fontSize: 10,
                fill: "#f97316",
                dy: -2,
              }}
            />
          )}

          <Area
            type="monotone"
            dataKey="diff"
            stroke="#60a5fa"
            strokeWidth={2.2}
            fill={`url(#${isLane ? "laneGrad" : "goldGrad"})`}
            dot={false}
            activeDot={{ r: 5, fill: lastDiff >= 0 ? "#10b981" : "#ef4444", stroke: "#0f1626", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Diff final */}
      <div className="flex items-center justify-end gap-1.5 text-xs pr-2">
        {lastDiff >= 0
          ? <span className="flex items-center gap-1 text-emerald-400"><TrendingUp size={11} />+{Math.abs(lastDiff).toLocaleString("pt-BR")} g ao final</span>
          : <span className="flex items-center gap-1 text-red-400"><TrendingDown size={11} />-{Math.abs(lastDiff).toLocaleString("pt-BR")} g ao final</span>
        }
      </div>
    </div>
  );
}

// =============================================================================
// LISTA DE EVENTOS SINCRONIZADA
// =============================================================================

function EventsList({ events, activeMinute }) {
  const listRef   = useRef(null);
  const itemRefs  = useRef({});

  // Scroll automático para o evento do minuto ativo
  useEffect(() => {
    if (activeMinute === null) return;
    const key = String(activeMinute);
    const el  = itemRefs.current[key];
    if (el && listRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeMinute]);

  // Filtra eventos relevantes (exclui abates aliados comuns para não poluir)
  const relevant = useMemo(() => (events ?? []).filter(ev =>
    ev.isPlayerDeath || ev.isPlayerKill ||
    ["BARON","DRAGON","HERALD","TOWER","INHIBITOR"].includes(ev.type)
  ), [events]);

  if (!relevant.length) return (
    <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
      Sem eventos relevantes
    </div>
  );

  return (
    <div
      ref={listRef}
      className="h-[240px] overflow-y-auto space-y-1 pr-1"
      style={{ scrollbarWidth: "thin", scrollbarColor: "#1d4ed8 #0f1626" }}
    >
      {relevant.map((ev, i) => {
        const { icon: Icon, color, text } = describeEvent(ev);
        const isActive = ev.minute === activeMinute;

        return (
          <div
            key={i}
            ref={(el) => { if (el) itemRefs.current[String(ev.minute)] = el; }}
            className={`
              flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all
              ${isActive
                ? "bg-blue-900/40 border border-blue-700/50 shadow-sm"
                : "hover:bg-white/[0.03] border border-transparent"
              }
            `}
          >
            {/* Minuto */}
            <span className={`font-mono w-6 shrink-0 text-right ${isActive ? "text-blue-300 font-bold" : "text-gray-600"}`}>
              {ev.minute}
            </span>

            {/* Ícone + Texto */}
            <Icon size={12} className={`shrink-0 ${color}`} />
            <span className={`leading-snug ${isActive ? "text-white font-medium" : "text-gray-400"}`}>{text}</span>

            {isActive && <ChevronRight size={11} className="ml-auto text-blue-400 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// PAINEL DE LANE ANALYSIS
// =============================================================================

function LaneAnalysisCard({ timeline }) {
  const { lane, myChampion, opponentChampion, opponentName, laneAnalysis } = timeline;
  if (!laneAnalysis) return null;

  return (
    <div className="bg-surface-700 border border-white/5 rounded-2xl p-4 space-y-3">
      {/* Header: quem vs quem */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`badge border text-xs px-2.5 py-1 rounded-full font-semibold ${LANE_COLOR[lane] ?? LANE_COLOR.UNKNOWN}`}>
          {LANE_LABEL[lane] ?? lane}
        </span>
        <span className="text-white font-bold">{myChampion ?? "Você"}</span>
        <span className="text-gray-600">vs</span>
        <span className="text-gray-300 font-semibold">{opponentChampion ?? "Oponente"}</span>
        {opponentName && (
          <span className="text-gray-600 text-xs">({opponentName})</span>
        )}
      </div>

      {/* Veredito */}
      <p className="text-sm font-semibold text-white">{laneAnalysis.verdict}</p>
      <p className="text-gray-400 text-sm leading-relaxed">{laneAnalysis.detail}</p>

      {laneAnalysis.trend && (
        <p className="text-yellow-400 text-sm leading-relaxed flex gap-2">
          <span className="shrink-0">→</span>{laneAnalysis.trend}
        </p>
      )}

      {/* Estatísticas */}
      <div className="grid grid-cols-3 gap-3 pt-1">
        {[
          { label: "Gold @15m",  value: `${laneAnalysis.at15 >= 0 ? "+" : ""}${laneAnalysis.at15.toLocaleString("pt-BR")}` },
          { label: "Pico Adv",   value: `+${laneAnalysis.peakAdv.toLocaleString("pt-BR")}` },
          { label: "Pico Def",   value: laneAnalysis.peakDef.toLocaleString("pt-BR") },
        ].map(({ label, value }) => (
          <div key={label} className="bg-surface-800 rounded-xl p-3 text-center">
            <p className="text-gray-500 text-[10px] uppercase tracking-wider">{label}</p>
            <p className="text-white font-bold text-sm mt-0.5">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// TAB BUTTON
// =============================================================================

function TabBtn({ active, onClick, icon: Icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
        ${active
          ? "border-blue-500 text-blue-300"
          : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700"
        }`}
    >
      <Icon size={14} />{label}
      {badge && (
        <span className="text-[10px] bg-blue-700/60 text-blue-200 px-1.5 py-0.5 rounded-full">{badge}</span>
      )}
    </button>
  );
}

// =============================================================================
// BUILD DIAGNOSIS PANEL
// =============================================================================

const PHASE_CONFIG = {
  early: { label: "Early Game",  color: "text-green-400  bg-green-900/30  border-green-700/40"  },
  mid:   { label: "Mid Game",    color: "text-yellow-400 bg-yellow-900/30 border-yellow-700/40" },
  late:  { label: "Late Game",   color: "text-orange-400 bg-orange-900/30 border-orange-700/40" },
};

const SEVERITY_CONFIG = {
  high:   {
    icon: ShieldAlert,
    bar:  "bg-red-600",
    border: "border-red-700/50",
    bg:     "bg-red-950/30",
    label:  "text-red-300",
    badge:  "bg-red-900/50 border-red-700/50 text-red-300",
  },
  medium: {
    icon: Info,
    bar:  "bg-yellow-500",
    border: "border-yellow-700/40",
    bg:     "bg-yellow-950/20",
    label:  "text-yellow-300",
    badge:  "bg-yellow-900/40 border-yellow-700/40 text-yellow-300",
  },
};

function WarningCard({ warning }) {
  const cfg = SEVERITY_CONFIG[warning.severity] ?? SEVERITY_CONFIG.medium;
  const Icon = cfg.icon;

  // Suporte a ambos os formatos: { text } (novo) e { message } (legado)
  const bodyText = warning.text ?? warning.message ?? "";
  const suggested = warning.suggestedItems ?? [];

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${cfg.bg} ${cfg.border}`}>
      {/* Barra lateral de severidade */}
      <div className={`w-0.5 self-stretch rounded-full shrink-0 ${cfg.bar}`} />
      <Icon size={15} className={`shrink-0 mt-0.5 ${cfg.label}`} />
      <div className="flex-1 min-w-0">
        {/* Cabeçalho: badge + tipo */}
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${cfg.badge}`}>
            {warning.severity === "high" ? "Crítico" : "Atenção"}
          </span>
          <span className="text-[10px] text-gray-600">
            {warning.type.replace(/_/g, " ")}
          </span>
        </div>

        {/* Mensagem principal */}
        <p className={`text-sm leading-relaxed ${cfg.label}`}>{bodyText}</p>

        {/* Itens sugeridos */}
        {suggested.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            <span className="text-[10px] text-gray-600 self-center">Considere:</span>
            {suggested.map((name, i) => (
              <span
                key={i}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full
                           bg-white/5 border border-white/15 text-gray-300
                           hover:border-blue-500/50 hover:text-white transition-colors"
              >
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BuildDiagnosisPanel({ match }) {
  const player = useMemo(
    () => match.participants?.find(p => p.isPlayer),
    [match.participants]
  );

  const diagnosis = useMemo(() => {
    if (!player) return null;
    try {
      return analyzeBuild(player, match.participants ?? [], match.durationMin ?? 0);
    } catch {
      return null;
    }
  }, [player, match.participants, match.durationMin]);

  if (!diagnosis) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-600 text-sm gap-2">
        <Package size={20} />
        <span>Dados de itens indisponíveis para esta partida.</span>
      </div>
    );
  }

  const { phase, itemNames, warnings } = diagnosis;
  const phaseCfg = PHASE_CONFIG[phase] ?? PHASE_CONFIG.late;
  const highCount   = warnings.filter(w => w.severity === "high").length;
  const mediumCount = warnings.filter(w => w.severity === "medium").length;

  return (
    <div className="p-4 lg:p-6 space-y-6">

      {/* ── Cabeçalho: fase + resumo ─────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`text-xs font-bold px-3 py-1.5 rounded-full border uppercase tracking-wider ${phaseCfg.color}`}>
          {phaseCfg.label}
        </span>
        <span className="text-gray-500 text-sm">
          {match.durationMin}min · {match.champion}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {highCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-300 bg-red-900/30 border border-red-700/40 px-2 py-1 rounded-full">
              <ShieldAlert size={11} />{highCount} crítico{highCount > 1 ? "s" : ""}
            </span>
          )}
          {mediumCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-yellow-300 bg-yellow-900/30 border border-yellow-700/40 px-2 py-1 rounded-full">
              <Info size={11} />{mediumCount} aviso{mediumCount > 1 ? "s" : ""}
            </span>
          )}
          {warnings.length === 0 && (
            <span className="flex items-center gap-1 text-xs text-emerald-300 bg-emerald-900/30 border border-emerald-700/40 px-2 py-1 rounded-full">
              <ShieldCheck size={11} />Build ótima
            </span>
          )}
        </div>
      </div>

      {/* ── Itens da partida ─────────────────────────────────────────── */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
          <Package size={12} />Itens Comprados ({player?.items?.length ?? 0})
        </h3>
        {player?.items?.length > 0 ? (
          <div className="bg-surface-800 border border-white/5 rounded-2xl p-4">
            <ItemRow items={player.items} size={36} showNames={false} />
            {/* Legenda textual (PT-BR) abaixo dos ícones */}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-3">
              {itemNames.map((name, i) => (
                <span key={i} className="text-[10px] text-gray-500 leading-tight">
                  {name}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-gray-700 text-sm italic">Nenhum item registrado.</p>
        )}
      </section>

      {/* ── Avisos ───────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
          <ShieldAlert size={12} />Diagnóstico de Build
          {warnings.length > 0 && (
            <span className="text-gray-700 font-normal normal-case">
              — {warnings.length} problema{warnings.length > 1 ? "s" : ""} detectado{warnings.length > 1 ? "s" : ""}
            </span>
          )}
        </h3>

        {warnings.length > 0 ? (
          <div className="space-y-3">
            {/* Críticos primeiro */}
            {[...warnings]
              .sort((a, b) => (a.severity === "high" ? -1 : 1) - (b.severity === "high" ? -1 : 1))
              .map((w, i) => <WarningCard key={i} warning={w} />)
            }
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-700/30
                          bg-emerald-950/20 px-4 py-4">
            <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-emerald-300 font-semibold text-sm">Build Aprovada</p>
              <p className="text-emerald-400/70 text-sm mt-0.5 leading-relaxed">
                Nenhum problema crítico detectado. Build adequada para a fase {phaseCfg.label.toLowerCase()},
                composição inimiga e campeão jogado.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── Nota de rodapé ───────────────────────────────────────────── */}
      <p className="text-gray-700 text-[10px] leading-relaxed">
        Análise baseada em regras heurísticas locais (penetração, composição inimiga, itens core por campeão).
        Não substitui análise humana avançada. IDs de itens podem variar entre patches.
      </p>

    </div>
  );
}

// =============================================================================
// FULL MATCH ANALYSIS — componente principal
// =============================================================================

export default function FullMatchAnalysis({ match, puuid, onClose }) {
  const [tab,          setTab]          = useState("timeline");
  const [timeline,     setTimeline]     = useState(null);
  const [tlLoading,    setTlLoading]    = useState(false);
  const [tlError,      setTlError]      = useState(null);
  const [activeMinute, setActiveMinute] = useState(null);
  // ── Atlas Brain (IA) ──────────────────────────────────────────────────────
  const [aiResult,  setAiResult]  = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState(null);

  // Busca timeline ao abrir (não lazy — o usuário veio aqui para a timeline)
  const fetchTimeline = useCallback(async () => {
    if (timeline || tlLoading) return;
    setTlLoading(true);
    setTlError(null);
    try {
      const { data } = await axios.get(
        `/api/timeline/${match.matchId}?puuid=${encodeURIComponent(puuid)}`
      );
      setTimeline(data);
    } catch (err) {
      setTlError(err.response?.data?.error ?? err.message ?? "Erro ao carregar timeline.");
    } finally {
      setTlLoading(false);
    }
  }, [match.matchId, puuid, timeline, tlLoading]);

  useEffect(() => { fetchTimeline(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Chama o Atlas Brain (Gemini)
  const fetchAiAnalysis = useCallback(async () => {
    if (aiResult || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const { data } = await axios.get(
        `/api/ai-coach/${match.matchId}?puuid=${encodeURIComponent(puuid)}`
      );
      setAiResult(data);
    } catch (err) {
      setAiError(err.response?.data?.error ?? err.message ?? "Erro na análise de IA.");
    } finally {
      setAiLoading(false);
    }
  }, [match.matchId, puuid, aiResult, aiLoading]);

  // ESC fecha
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Bloqueia scroll do body
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const { champion, win, kills, deaths, assists, kda, durationMin, analysis } = match;

  const hasLane = !!(timeline?.laneGoldDiff?.length);

  // ── Render ─────────────────────────────────────────────────────────────────
  const modal = (
    <div className="fixed inset-0 z-[60] flex flex-col bg-surface-900 overflow-hidden">

      {/* ── STICKY HEADER ──────────────────────────────────────────────────── */}
      <header className={`shrink-0 border-b border-white/5 ${win ? "bg-emerald-950/30" : "bg-red-950/20"}`}>
        <div className="flex items-center gap-3 px-5 py-3.5 flex-wrap">

          {/* Campeão + resultado */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0
            ${win
              ? "bg-emerald-800/40 text-emerald-200 border border-emerald-700/40"
              : "bg-red-800/30 text-red-200 border border-red-700/30"
            }`}
          >
            {champion.slice(0, 2).toUpperCase()}
          </div>

          <div>
            <p className="font-bold text-white text-base leading-tight">
              {champion}
              <span className={`ml-2 text-sm font-semibold ${win ? "text-emerald-400" : "text-red-400"}`}>
                {win ? "Vitória" : "Derrota"}
              </span>
            </p>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className={`text-sm font-bold ${kdaColor(kda)}`}>{kills}/{deaths}/{assists}</span>
              {analysis && <>
                <span className="text-gray-600 text-xs">{analysis.csPerMin} cs/min</span>
                <span className="text-gray-600 text-xs">{analysis.goldPerMin} g/min</span>
                <span className="text-gray-600 text-xs">{analysis.killParticipation}% KP</span>
              </>}
              <span className="text-gray-600 text-xs flex items-center gap-1">
                <Clock size={10} />{durationMin}m
              </span>
              {timeline?.lane && timeline.lane !== "UNKNOWN" && (
                <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${LANE_COLOR[timeline.lane] ?? LANE_COLOR.UNKNOWN}`}>
                  {LANE_LABEL[timeline.lane]}
                </span>
              )}
            </div>
          </div>

          {/* Botão Atlas Brain */}
          <button
            onClick={fetchAiAnalysis}
            disabled={aiLoading || !!aiResult}
            className={`
              ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
              transition-all shrink-0
              ${aiResult
                ? "bg-violet-900/40 border border-violet-600/50 text-violet-300 cursor-default"
                : aiLoading
                  ? "bg-violet-900/20 border border-violet-700/30 text-violet-400 cursor-wait"
                  : "bg-violet-700/20 border border-violet-600/40 text-violet-300 hover:bg-violet-700/40 hover:border-violet-500/60"
              }
            `}
            title="Análise profunda com Google Gemini"
          >
            {aiLoading
              ? <Loader2 size={14} className="animate-spin" />
              : <Bot size={14} />
            }
            {aiLoading ? "Analisando…" : aiResult ? "Brain ✓" : "Atlas Brain"}
          </button>

          {/* Botão fechar */}
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-t border-white/5 overflow-x-auto">
          <TabBtn active={tab === "timeline"}   onClick={() => setTab("timeline")}   icon={Activity}   label="Timeline" />
          {hasLane && (
            <TabBtn
              active={tab === "lane"}
              onClick={() => setTab("lane")}
              icon={Crosshair}
              label={`1v1 vs ${timeline.opponentChampion ?? "Oponente"}`}
              badge={LANE_LABEL[timeline.lane] ?? null}
            />
          )}
          <TabBtn active={tab === "adversarios"} onClick={() => setTab("adversarios")} icon={Users}    label="Adversários" />
          <TabBtn active={tab === "build"}       onClick={() => setTab("build")}       icon={Package} label="Build" />
        </div>
      </header>

      {/* ── CONTEÚDO ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Loading */}
        {tlLoading && (
          <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
            <Loader2 size={18} className="animate-spin" />Carregando timeline…
          </div>
        )}

        {/* Erro */}
        {tlError && !tlLoading && (
          <div className="m-6 flex items-start gap-3 bg-red-900/20 border border-red-700/30
                          rounded-xl px-4 py-3 text-red-300 text-sm">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />{tlError}
          </div>
        )}

        {/* ── TAB: TIMELINE ──────────────────────────────────────────────── */}
        {tab === "timeline" && timeline && !tlLoading && (
          <div className="p-4 lg:p-6 space-y-6">

            {/* Grade: Gráfico (esq) + Eventos (dir) */}
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
                Diferença de Ouro do Time
              </h2>
              <div className="flex flex-col lg:flex-row gap-4">

                {/* Gráfico */}
                <div className="flex-1 min-w-0 bg-surface-800 border border-white/5 rounded-2xl p-4">
                  <GoldAreaChart
                    data={timeline.goldDiffs}
                    events={timeline.events}
                    tippingPoint={timeline.tippingPoint}
                    onMinuteHover={setActiveMinute}
                    isLane={false}
                  />
                </div>

                {/* Eventos sincronizados */}
                <div className="lg:w-72 xl:w-80 shrink-0 bg-surface-800 border border-white/5 rounded-2xl p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
                    <Swords size={12} />Eventos Chave
                    {activeMinute !== null && (
                      <span className="ml-auto text-blue-400 font-normal normal-case">min {activeMinute}</span>
                    )}
                  </p>
                  <EventsList events={timeline.events} activeMinute={activeMinute} />
                </div>
              </div>
            </section>

            {/* Tipping Point */}
            {timeline.tippingPoint && (
              <div className="flex items-start gap-3 bg-orange-900/20 border border-orange-700/30
                              rounded-2xl px-5 py-4">
                <TriangleAlert size={16} className="shrink-0 mt-0.5 text-orange-400" />
                <div>
                  <p className="text-orange-300 font-semibold text-sm">Momento da Virada — Minuto {timeline.tippingPoint.minute}</p>
                  <p className="text-orange-300/80 text-sm mt-0.5">{timeline.tippingPoint.description}</p>
                </div>
              </div>
            )}

            {/* ── Atlas Brain (Gemini) ─────────────────────────────── */}
            {(aiLoading || aiError || aiResult) && (
              <section className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-violet-500 flex items-center gap-2">
                  <Bot size={13} />Atlas Brain — Diagnóstico por IA
                </h2>

                {/* Loading */}
                {aiLoading && (
                  <div className="bg-violet-950/20 border border-violet-700/30 rounded-2xl px-5 py-6 flex items-center gap-3 text-violet-300 text-sm">
                    <Loader2 size={16} className="animate-spin shrink-0" />
                    Gemini está analisando a partida — pode levar alguns segundos…
                  </div>
                )}

                {/* Erro */}
                {aiError && !aiLoading && (
                  <div className="flex items-start gap-3 bg-red-900/20 border border-red-700/30 rounded-2xl px-4 py-3 text-red-300 text-sm">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />{aiError}
                  </div>
                )}

                {/* Resultado */}
                {aiResult && !aiLoading && (
                  <div className="bg-violet-950/20 border border-violet-700/30 rounded-2xl p-5 space-y-5">

                    {/* Causa-raiz */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold uppercase tracking-widest text-violet-400 flex items-center gap-1.5">
                        <Target size={11} />Causa-Raiz Identificada
                      </p>
                      <p className="text-white font-semibold text-base leading-snug">{aiResult.mainIssue}</p>
                    </div>

                    {/* Análise detalhada */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold uppercase tracking-widest text-violet-400 flex items-center gap-1.5">
                        <Activity size={11} />Análise Detalhada
                      </p>
                      <p className="text-gray-300 text-sm leading-relaxed">{aiResult.detailedAnalysis}</p>
                    </div>

                    {/* Dicas práticas */}
                    {aiResult.actionableTips?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-violet-400 flex items-center gap-1.5">
                          <Lightbulb size={11} />Dicas Práticas
                        </p>
                        <ol className="space-y-2">
                          {aiResult.actionableTips.map((tip, i) => (
                            <li key={i} className="flex gap-3 text-sm text-gray-300 leading-relaxed">
                              <span className="shrink-0 w-5 h-5 rounded-full bg-violet-800/60 border border-violet-600/50
                                               text-violet-300 text-[10px] font-bold flex items-center justify-center mt-0.5">
                                {i + 1}
                              </span>
                              {tip}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Momento crítico */}
                    {aiResult.criticalMoment && (
                      <div className="flex items-start gap-3 bg-violet-900/30 border border-violet-600/40 rounded-xl px-4 py-3">
                        <Zap size={15} className="shrink-0 mt-0.5 text-violet-300" />
                        <div>
                          <p className="text-violet-200 font-semibold text-sm">
                            Minuto {aiResult.criticalMoment.minute} — Momento Decisivo
                          </p>
                          <p className="text-violet-300/80 text-sm mt-0.5">{aiResult.criticalMoment.reason}</p>
                        </div>
                      </div>
                    )}

                    <p className="text-gray-700 text-[10px] text-right">Powered by Google Gemini 1.5 Flash</p>
                  </div>
                )}
              </section>
            )}

            {/* Positivos / Negativos / Veredito */}
            {analysis && (
              <section className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  Análise da Partida
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-2xl p-4 space-y-2">
                    <p className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                      <ThumbsUp size={12} />O que funcionou
                    </p>
                    {analysis.positives.length > 0
                      ? analysis.positives.map((p, i) => (
                          <p key={i} className="text-emerald-300 text-sm leading-relaxed flex gap-2">
                            <span className="text-emerald-600 shrink-0">✓</span>{p}
                          </p>
                        ))
                      : <p className="text-gray-700 text-sm italic">Nenhum destaque positivo.</p>
                    }
                  </div>
                  <div className="bg-red-950/30 border border-red-800/30 rounded-2xl p-4 space-y-2">
                    <p className="flex items-center gap-2 text-xs font-bold text-red-400 uppercase tracking-wider">
                      <ThumbsDown size={12} />O que falhou
                    </p>
                    {analysis.negatives.length > 0
                      ? analysis.negatives.map((n, i) => (
                          <p key={i} className="text-red-300 text-sm leading-relaxed flex gap-2">
                            <span className="text-red-600 shrink-0">✗</span>{n}
                          </p>
                        ))
                      : <p className="text-gray-700 text-sm italic">Sem erros críticos.</p>
                    }
                  </div>
                </div>
                <div className={`rounded-2xl px-5 py-3.5 border text-sm font-semibold
                  ${win
                    ? "bg-emerald-900/20 border-emerald-700/30 text-emerald-300"
                    : "bg-red-900/20 border-red-700/30 text-red-300"
                  }`}
                >
                  <span className="text-gray-500 text-xs mr-2 font-normal">VEREDITO</span>
                  {analysis.verdict}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ── TAB: 1v1 LANE ──────────────────────────────────────────────── */}
        {tab === "lane" && timeline && !tlLoading && (
          <div className="p-4 lg:p-6 space-y-6">

            {/* Análise textual da rota */}
            <LaneAnalysisCard timeline={timeline} />

            {/* Gráfico 1v1 */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  Gold Diff vs {timeline.opponentChampion ?? "Oponente"} (minuto a minuto)
                </h2>
              </div>
              <div className="bg-surface-800 border border-white/5 rounded-2xl p-4">
                <GoldAreaChart
                  data={timeline.laneGoldDiff}
                  events={timeline.events}
                  tippingPoint={null}    // Tipping Point é do time, não da rota
                  onMinuteHover={setActiveMinute}
                  isLane={true}
                  opponentChampion={timeline.opponentChampion}
                />
              </div>
            </section>

            {/* Eventos da rota sincronizados */}
            <section className="bg-surface-800 border border-white/5 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
                <Swords size={12} />Eventos da Rota
                {activeMinute !== null && (
                  <span className="ml-auto text-blue-400 font-normal normal-case">min {activeMinute}</span>
                )}
              </p>
              <EventsList events={timeline.events} activeMinute={activeMinute} />
            </section>

            {/* Colunas: Gold@min para ambos */}
            {timeline.laneGoldDiff?.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  Comparativo de Gold Acumulado
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      label:    timeline.myChampion ?? "Você",
                      color:    "text-blue-300",
                      accent:   "border-blue-700/30 bg-blue-900/10",
                      getGold:  (d) => d.myGold,
                    },
                    {
                      label:    timeline.opponentChampion ?? "Oponente",
                      color:    "text-red-300",
                      accent:   "border-red-700/30 bg-red-900/10",
                      getGold:  (d) => d.opponentGold,
                    },
                  ].map(({ label, color, accent, getGold }) => {
                    const last    = timeline.laneGoldDiff[timeline.laneGoldDiff.length - 1];
                    const at15    = timeline.laneGoldDiff.find(d => d.minute === 15);
                    const goldEnd = getGold(last ?? {});
                    const gold15  = getGold(at15 ?? last ?? {});
                    return (
                      <div key={label} className={`rounded-2xl border p-4 space-y-2 ${accent}`}>
                        <p className={`text-sm font-bold ${color}`}>{label}</p>
                        <p className="text-white text-2xl font-bold">{goldEnd.toLocaleString("pt-BR")}</p>
                        <p className="text-gray-500 text-xs">Gold total no fim</p>
                        <p className="text-gray-400 text-xs">Min 15: <strong className="text-white">{gold15.toLocaleString("pt-BR")}</strong></p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Sem dados de rota */}
            {!hasLane && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-600 gap-2">
                <Coins size={28} />
                <p className="text-sm">Oponente de rota não detectado automaticamente.</p>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: ADVERSÁRIOS ───────────────────────────────────────────── */}
        {tab === "adversarios" && (
          <div className="p-4 lg:p-6">
            <MatchupGrid participants={match.participants} />
          </div>
        )}

        {/* ── TAB: BUILD ─────────────────────────────────────────────────── */}
        {tab === "build" && (
          <BuildDiagnosisPanel match={match} />
        )}

      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
