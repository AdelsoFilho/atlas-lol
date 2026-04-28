import { useState, useEffect, useCallback, useRef, memo } from "react";
import axios from "axios";
import { useGameClock, fmtTime, FRESHNESS_CONFIG } from "../hooks/useGameClock";
import {
  Swords,
  Radio,
  RefreshCw,
  AlertTriangle,
  Copy,
  Check,
  ChevronRight,
  Zap,
  Shield,
  Skull,
  Clock,
} from "lucide-react";

// =============================================================================
// WarRoomDashboard.jsx — Painel de Operações em Tempo Real
//
// Consome GET /api/war-room/:riotId
// Layout 3 colunas: Time Azul | Live Feed | Time Vermelho
// + Counterplay Cards abaixo
//
// Props:
//   riotId {string} — "GameName#TAG"
// =============================================================================

// Intervalo inicial de polling (substituído por nextUpdateIn da API após a 1ª resposta)
const DEFAULT_POLL_SEC = 60;

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------

const SPELL_NAMES = {
  1: "CLN",
  3: "EXH",
  4: "FLA",
  6: "GHO",
  7: "HEA",
  11: "SMI",
  12: "TEL",
  13: "CLR",
  14: "IGN",
  21: "BAR",
  32: "SNO",
};

const ROLE_STYLES = {
  fighter:  { label: "Fighter",  cls: "bg-orange-900/60 text-orange-300 border border-orange-700/50" },
  mage:     { label: "Mage",     cls: "bg-purple-900/60 text-purple-300 border border-purple-700/50" },
  assassin: { label: "Assassin", cls: "bg-red-900/60    text-red-300    border border-red-700/50"    },
  marksman: { label: "ADC",      cls: "bg-yellow-900/60 text-yellow-300 border border-yellow-700/50" },
  tank:     { label: "Tank",     cls: "bg-blue-900/60   text-blue-300   border border-blue-700/50"   },
  support:  { label: "Support",  cls: "bg-green-900/60  text-green-300  border border-green-700/50"  },
};

const PRIORITY_STYLES = {
  CRITICAL: {
    badge: "bg-red-600 text-white shadow-[0_0_8px_rgba(239,68,68,0.7)]",
    border: "border-red-600/60",
  },
  HIGH: {
    badge: "bg-orange-600 text-white",
    border: "border-orange-600/50",
  },
  MEDIUM: {
    badge: "bg-yellow-600 text-black font-bold",
    border: "border-yellow-600/40",
  },
  LOW: {
    badge: "bg-gray-700 text-gray-300",
    border: "border-gray-700/40",
  },
};

function getLevelBadgeClass(level) {
  if (!level) return "bg-gray-700 text-gray-400";
  if (level >= 16) return "bg-red-700 text-red-100";
  if (level >= 11) return "bg-yellow-700 text-yellow-100";
  if (level >= 6)  return "bg-orange-700 text-orange-100";
  return "bg-gray-700 text-gray-400";
}

function formatRelativeTime(ts) {
  if (!ts) return "agora";
  const diff = Math.floor((Date.now() - ts * 1000) / 1000);
  if (diff < 10)  return "agora";
  if (diff < 60)  return `${diff}s atrás`;
  const mins = Math.floor(diff / 60);
  if (mins < 60)  return `${mins}m atrás`;
  return `${Math.floor(mins / 60)}h atrás`;
}

function getSpellLabel(id) {
  return SPELL_NAMES[id] ?? `S${id}`;
}

// ---------------------------------------------------------------------------
// Sub-component: PlayerRow (memoized)
// ---------------------------------------------------------------------------

const PlayerRow = memo(function PlayerRow({ player, side }) {
  const role   = ROLE_STYLES[player.strategy?.role] ?? null;
  const lvlCls = getLevelBadgeClass(player.estimatedLevel);
  const isBlue = side === "blue";

  return (
    <div
      className={`flex ${isBlue ? "flex-row" : "flex-row-reverse"} items-start gap-3 py-2.5 px-3
        rounded-lg hover:bg-white/5 transition-colors duration-150 group`}
    >
      {/* Champion icon placeholder — colored circle with initial */}
      <div
        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
          ${isBlue ? "bg-blue-900/70 text-blue-200 ring-1 ring-blue-600/50"
                   : "bg-red-900/70  text-red-200  ring-1 ring-red-600/50"}`}
      >
        {player.champion ? player.champion.slice(0, 2) : "?"}
      </div>

      {/* Info block */}
      <div className={`flex-1 min-w-0 ${isBlue ? "text-left" : "text-right"}`}>
        {/* Champion + name row */}
        <div className={`flex items-center gap-1.5 flex-wrap ${isBlue ? "" : "justify-end"}`}>
          <span className="font-bold text-sm text-gray-100 truncate">
            {player.champion ?? "???"}
          </span>
          {!player.rosterFull && (
            <span title="Dados parciais" className="text-yellow-400 text-xs leading-none">⚠</span>
          )}
        </div>

        {/* Summoner ID */}
        <div className={`flex items-center gap-0.5 text-xs mt-0.5 ${isBlue ? "" : "justify-end"}`}>
          <span className="text-gray-400 truncate">{player.gameName ?? "—"}</span>
          {player.tagLine && (
            <span className="font-mono text-cyan-400">#{player.tagLine}</span>
          )}
        </div>

        {/* Badges row */}
        <div className={`flex items-center gap-1.5 mt-1.5 flex-wrap ${isBlue ? "" : "justify-end"}`}>
          {/* Level badge */}
          {player.estimatedLevel && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${lvlCls}`}>
              lvl {player.estimatedLevel}
            </span>
          )}

          {/* Role pill */}
          {role && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${role.cls}`}>
              {role.label}
            </span>
          )}

          {/* Summoner spells */}
          <span className="font-mono text-[10px] text-gray-500">
            {getSpellLabel(player.spell1Id)}/{getSpellLabel(player.spell2Id)}
          </span>
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Sub-component: EventItem
// ---------------------------------------------------------------------------

function EventItem({ event, index }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Stagger animation slightly based on index to avoid all appearing at once
    const t = setTimeout(() => setVisible(true), index * 60);
    return () => clearTimeout(t);
  }, [index]);

  const colorCls =
    event.team === "blue"  ? "text-blue-400" :
    event.team === "red"   ? "text-red-400"  :
    "text-yellow-400";

  const iconCls =
    event.team === "blue"  ? "text-blue-500" :
    event.team === "red"   ? "text-red-500"  :
    "text-yellow-500";

  const EventIcon = event.type === "LEVEL_SPIKE" ? Zap :
                    event.type === "KILL"        ? Skull :
                    event.type === "OBJECTIVE"   ? Shield :
                    ChevronRight;

  return (
    <div
      className={`flex items-start gap-2 py-2 px-2 rounded-md text-xs
        border-l-2 ${event.team === "blue" ? "border-blue-700" : event.team === "red" ? "border-red-700" : "border-yellow-700"}
        bg-white/3 hover:bg-white/5 transition-all duration-300
        ${visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-3"}`}
      style={{ transitionProperty: "opacity, transform" }}
    >
      <EventIcon size={12} className={`${iconCls} shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className={`${colorCls} leading-snug`}>{event.msg ?? event.type}</p>
      </div>
      <span className="text-gray-600 font-mono shrink-0 text-[10px]">
        {formatRelativeTime(event.ts)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: CounterCard (memoized)
// ---------------------------------------------------------------------------

const CounterCard = memo(function CounterCard({ card }) {
  const [read, setRead]         = useState(false);
  const [copied, setCopied]     = useState(false);

  const prio = PRIORITY_STYLES[card.priority] ?? PRIORITY_STYLES.LOW;

  function handleCopy() {
    const text = `[${card.priority}] ${card.target}: ${card.advice}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      className={`flex flex-col gap-2 p-3 rounded-lg border bg-surface-800
        ${prio.border} ${read ? "opacity-50" : ""} transition-opacity duration-300`}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${prio.badge}`}>
          {card.priority}
        </span>
        <span className="text-sm font-bold text-gray-100 truncate flex-1">
          {card.icon && <span className="mr-1">{card.icon}</span>}
          {card.target}
        </span>
        {card.type && (
          <span className="text-[10px] text-gray-600 font-mono shrink-0">{card.type}</span>
        )}
      </div>

      {/* Advice */}
      <p className="text-xs text-gray-300 leading-relaxed">{card.advice}</p>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-1">
        <button
          onClick={() => setRead(r => !r)}
          className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors
            ${read
              ? "border-green-700/50 bg-green-900/30 text-green-400"
              : "border-gray-700 bg-gray-800 text-gray-500 hover:border-gray-500 hover:text-gray-300"}`}
        >
          <Check size={10} />
          {read ? "Lido" : "Marcar lido"}
        </button>

        <button
          onClick={handleCopy}
          title="Copiar para área de transferência"
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-gray-700
            bg-gray-800 text-gray-500 hover:border-cyan-700 hover:text-cyan-400 transition-colors ml-auto"
        >
          {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
          {copied ? "Copiado!" : "Copiar"}
        </button>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Sub-component: TeamPanel
// ---------------------------------------------------------------------------

function TeamPanel({ players, side, label }) {
  const colorCls = side === "blue"
    ? "text-blue-400 border-blue-800/60 bg-blue-950/20"
    : "text-red-400  border-red-800/60  bg-red-950/20";

  return (
    <div className={`flex flex-col rounded-xl border ${colorCls} overflow-hidden`}>
      {/* Header */}
      <div className={`px-4 py-2.5 border-b ${side === "blue" ? "border-blue-800/40" : "border-red-800/40"}`}>
        <h2 className={`text-xs font-bold tracking-widest uppercase ${side === "blue" ? "text-blue-400" : "text-red-400"}`}>
          {label}
        </h2>
      </div>

      {/* Players */}
      <div className="flex flex-col divide-y divide-white/5 px-1 py-1">
        {players.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-white/3 my-1 animate-pulse" />
            ))
          : players.map(p => (
              <PlayerRow key={p.puuid ?? p.displayId ?? p.champion ?? Math.random()} player={p} side={side} />
            ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: SkeletonLoader
// ---------------------------------------------------------------------------

function SkeletonLoader() {
  return (
    <div className="flex flex-col gap-4">
      {/* Header skeleton */}
      <div className="h-12 rounded-xl bg-surface-800 animate-pulse" />

      {/* 3-col grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Blue team */}
        <div className="flex flex-col gap-2 p-3 rounded-xl border border-blue-900/40 bg-blue-950/10">
          <div className="h-4 w-24 bg-blue-900/40 rounded animate-pulse" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-white/4 animate-pulse" />
          ))}
        </div>

        {/* Feed */}
        <div className="flex flex-col gap-2 p-3 rounded-xl border border-white/10 bg-white/3">
          <div className="h-4 w-20 bg-white/10 rounded animate-pulse" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 rounded-md bg-white/5 animate-pulse" />
          ))}
        </div>

        {/* Red team */}
        <div className="flex flex-col gap-2 p-3 rounded-xl border border-red-900/40 bg-red-950/10">
          <div className="h-4 w-28 bg-red-900/40 rounded animate-pulse" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-white/4 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility: format seconds as MM:SS countdown
// ---------------------------------------------------------------------------

function fmtCountdown(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ---------------------------------------------------------------------------
// Main component: WarRoomDashboard
// ---------------------------------------------------------------------------

export default function WarRoomDashboard({ riotId }) {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [simulate,    setSimulate]    = useState(false);
  const [receivedAt,  setReceivedAt]  = useState(null);   // Date.now() ao receber resposta
  const [events,      setEvents]      = useState([]);     // accumulated events
  const [headerFlash, setHeaderFlash] = useState(false);

  // Intervalo dinâmico para próximo poll (da API) e refs de controle
  const nextUpdateRef = useRef(DEFAULT_POLL_SEC);
  const pollTimerRef  = useRef(null);

  // Ref to keep latest events inside polling callback without stale closure
  const eventsRef = useRef([]);
  eventsRef.current = events;

  // ---- fetch ---------------------------------------------------------------

  const fetchData = useCallback(async () => {
    if (!riotId) return;
    try {
      const url = `/api/war-room/${encodeURIComponent(riotId)}${simulate ? "?simulate=true" : ""}`;
      const res = await axios.get(url);
      const incoming = res.data;

      setData(incoming);
      setReceivedAt(Date.now());
      setError(null);

      // Atualiza o intervalo para o próximo poll baseado na fase do jogo
      nextUpdateRef.current = incoming.nextUpdateIn ?? DEFAULT_POLL_SEC;

      // Accumulate live events (prepend new, max 20)
      if (incoming.liveEvents?.length) {
        const existingTs = new Set(eventsRef.current.map(e => e.ts + (e.msg ?? "")));
        const newEvts = incoming.liveEvents.filter(e => !existingTs.has(e.ts + (e.msg ?? "")));
        if (newEvts.length) {
          setEvents(prev => [...newEvts, ...prev].slice(0, 20));
        }
      }

      // Flash header green
      setHeaderFlash(true);
      setTimeout(() => setHeaderFlash(false), 1000);
    } catch (err) {
      setError(err?.response?.data?.message ?? err.message ?? "Erro ao carregar dados");
      nextUpdateRef.current = 90; // backoff conservador em erro
    } finally {
      setLoading(false);
    }
  }, [riotId, simulate]);

  // ---- polling effect (setTimeout adaptativo) -------------------------------
  // Cada resposta da API define nextUpdateRef.current (45-90s conforme fase/rate limit)

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setEvents([]);

    async function poll() {
      if (cancelled) return;
      await fetchData();
      if (!cancelled) {
        pollTimerRef.current = setTimeout(poll, nextUpdateRef.current * 1000);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(pollTimerRef.current);
    };
  }, [fetchData]);

  // ---- relógio projetado + freshness ----------------------------------------
  // Converte "MM:SS" do data.gameTime para segundos (para o hook)
  function parseGameTimeSec(gt) {
    if (!gt) return null;
    const [m, s] = String(gt).split(":").map(Number);
    return (isNaN(m) ? 0 : m) * 60 + (isNaN(s) ? 0 : s);
  }

  const gameLengthSec  = parseGameTimeSec(data?.gameTime);
  const { projectedSec, freshness, elapsed } = useGameClock(
    gameLengthSec,
    receivedAt,
    data?.nextUpdateIn ?? DEFAULT_POLL_SEC,
  );
  const freshnessConf = FRESHNESS_CONFIG[freshness];
  const countdown     = Math.max(0, (data?.nextUpdateIn ?? DEFAULT_POLL_SEC) - elapsed);

  // ---- render: loading -----------------------------------------------------

  if (loading) {
    return (
      <div className="p-4">
        <SkeletonLoader />
      </div>
    );
  }

  // ---- render: error -------------------------------------------------------

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <AlertTriangle size={32} className="text-red-500" />
        <p className="text-red-400 text-sm max-w-xs">{error}</p>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="flex items-center gap-2 px-4 py-2 bg-surface-700 hover:bg-surface-600
            border border-white/10 rounded-lg text-sm text-gray-300 transition-colors"
        >
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  // ---- render: not live ----------------------------------------------------

  if (!data?.isLive) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-24 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-surface-800 border border-white/10 flex items-center justify-center">
          <Swords size={28} className="text-gray-600" />
        </div>
        <div>
          <p className="text-gray-400 text-sm">Nenhuma partida em andamento.</p>
          <p className="text-gray-600 text-xs mt-1">
            Clique em{" "}
            <button
              onClick={() => setSimulate(true)}
              className="text-cyan-500 hover:text-cyan-400 underline font-mono"
            >
              SIM
            </button>{" "}
            para testar com dados simulados.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSimulate(s => !s)}
            className={`text-xs px-3 py-1.5 rounded border font-mono transition-colors
              ${simulate
                ? "bg-cyan-900/40 border-cyan-600/60 text-cyan-400"
                : "bg-surface-700 border-white/10 text-gray-500 hover:text-gray-300"}`}
          >
            {simulate ? "SIM ON" : "SIM"}
          </button>
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-white/10
              bg-surface-700 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <RefreshCw size={12} /> Atualizar
          </button>
        </div>
      </div>
    );
  }

  // ---- render: live dashboard ----------------------------------------------

  const blueTeam = data.blueTeam ?? [];
  const redTeam  = data.redTeam  ?? [];
  const counters = data.counterStrategies ?? [];

  const isPlayerBlue = data.playerTeamId === 100;

  return (
    <div className="flex flex-col gap-4 p-4 min-h-0">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border
          bg-surface-800 transition-all duration-500
          ${headerFlash
            ? "border-green-500/70 shadow-[0_0_12px_rgba(34,197,94,0.25)]"
            : "border-white/8"}`}
      >
        {/* Title */}
        <Swords size={18} className="text-cyan-400 shrink-0" />
        <span className="font-bold text-sm tracking-widest uppercase text-gray-200 hidden sm:inline">
          War Room
        </span>

        {/* Live badge */}
        <div className="flex items-center gap-1.5 ml-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-red-400 text-xs font-bold tracking-wider">AO VIVO</span>
        </div>

        {/* Game time — projetado com dot de freshness */}
        {gameLengthSec != null ? (
          <div className="flex items-center gap-1.5" title={freshnessConf.label}>
            <span className={`w-1.5 h-1.5 rounded-full ${freshnessConf.dot}`} />
            <span className={`font-mono text-sm font-bold ${freshnessConf.text}`}>
              {fmtTime(projectedSec)}
            </span>
          </div>
        ) : (
          <span className="font-mono text-cyan-300 text-sm font-bold">
            {data.gameTime ?? "--:--"}
          </span>
        )}

        {/* Game mode */}
        {data.gameMode && (
          <span className="hidden md:inline text-[10px] text-gray-600 font-mono truncate">
            {data.gameMode.replace("RANKED_SOLO_5x5", "Solo/Duo").replace("RANKED_FLEX_SR", "Flex")}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Player team indicator */}
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
              isPlayerBlue
                ? "text-blue-300 border-blue-700/50 bg-blue-900/30"
                : "text-red-300  border-red-700/50  bg-red-900/30"
            }`}
          >
            {isPlayerBlue ? "AZUL" : "VRM"}
          </span>

          {/* Sim toggle */}
          <button
            onClick={() => setSimulate(s => !s)}
            title={simulate ? "Desativar simulação" : "Ativar simulação"}
            className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors
              ${simulate
                ? "bg-cyan-900/40 border-cyan-600/50 text-cyan-400"
                : "bg-surface-700 border-white/10  text-gray-600 hover:text-gray-400"}`}
          >
            {simulate ? "SIM ON" : "SIM"}
          </button>

          {/* Countdown + manual refresh */}
          <button
            onClick={() => { setLoading(false); fetchData(); }}
            className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded border
              border-white/10 bg-surface-700 text-gray-500 hover:text-cyan-400 hover:border-cyan-700/40
              transition-colors"
            title="Atualizar agora"
          >
            <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
            {fmtCountdown(countdown)} ↺
          </button>
        </div>
      </header>

      {/* ── 3-column grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.1fr_1fr] gap-4">

        {/* Blue Team */}
        <TeamPanel players={blueTeam} side="blue" label="Time Azul" />

        {/* Live Event Feed */}
        <div className="flex flex-col rounded-xl border border-white/8 bg-surface-800 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/8">
            <h2 className="text-xs font-bold tracking-widest uppercase text-gray-500 flex items-center gap-2">
              <Radio size={11} className="text-yellow-500" />
              Live Feed
              {events.length > 0 && (
                <span className="ml-auto font-mono text-gray-700 normal-case tracking-normal">
                  {events.length}/20
                </span>
              )}
            </h2>
          </div>

          <div className="flex flex-col gap-1 p-2 overflow-y-auto max-h-[340px] md:max-h-none">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <Clock size={18} className="text-gray-700" />
                <p className="text-gray-700 text-xs">Aguardando eventos...</p>
              </div>
            ) : (
              events.map((ev, i) => (
                <EventItem
                  key={`${ev.ts}-${ev.msg}-${i}`}
                  event={ev}
                  index={i}
                />
              ))
            )}
          </div>
        </div>

        {/* Red Team */}
        <TeamPanel players={redTeam} side="red" label="Time Vermelho" />
      </div>

      {/* ── Counterplay Cards ───────────────────────────────────────────── */}
      {counters.length > 0 && (
        <section className="flex flex-col gap-3">
          {/* Section header */}
          <div className="flex items-center gap-3 px-1">
            <div className="flex-1 h-px bg-white/6" />
            <h2 className="text-[10px] font-bold tracking-widest uppercase text-gray-600 whitespace-nowrap">
              Counterplay Ativo
            </h2>
            <div className="flex-1 h-px bg-white/6" />
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {counters.map((card, i) => (
              <CounterCard
                key={`${card.target}-${card.type}-${i}`}
                card={card}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Footer note ─────────────────────────────────────────────────── */}
      <p className="text-center text-[10px] text-gray-800 font-mono pb-1">
        {data.simulated ? "dados simulados · " : ""}
        atualiza a cada {data.nextUpdateIn ?? DEFAULT_POLL_SEC}s
        {data.gameId ? ` · game ${data.gameId.slice(-6)}` : ""}
      </p>
    </div>
  );
}
