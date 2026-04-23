import { useRef } from "react";
import { Swords, Shield, Crown, Skull, Flame, TriangleAlert } from "lucide-react";

// ─── TimelineViewer ───────────────────────────────────────────────────────────
// Barra de timeline horizontal rolável com marcadores de eventos coloridos.
// Verde  = abate aliado / objetivo aliado
// Vermelho = morte sua / objetivo inimigo
// Amarelo = Barão
// Laranja = Tipping Point
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_CONFIG = {
  BARON: {
    label: "Barão",
    icon:  Crown,
    allyClass:   "bg-purple-500 text-white",
    enemyClass:  "bg-purple-800 text-purple-200 opacity-80",
  },
  DRAGON: {
    label: "Dragão",
    icon:  Flame,
    allyClass:   "bg-orange-500 text-white",
    enemyClass:  "bg-orange-900 text-orange-300 opacity-80",
  },
  HERALD: {
    label: "Herald",
    icon:  Shield,
    allyClass:   "bg-teal-500 text-white",
    enemyClass:  "bg-teal-900 text-teal-300 opacity-80",
  },
  TOWER: {
    label: "Torre",
    icon:  Shield,
    allyClass:   "bg-blue-500 text-white",
    enemyClass:  "bg-red-600 text-white opacity-80",
  },
  INHIBITOR: {
    label: "Inibidor",
    icon:  Shield,
    allyClass:   "bg-blue-400 text-white",
    enemyClass:  "bg-red-500 text-white opacity-80",
  },
};

function EventDot({ event, totalMin }) {
  const leftPct = `${(event.minute / Math.max(totalMin, 1)) * 100}%`;

  // Morte do jogador — sempre vermelho urgente
  if (event.type === "CHAMPION_KILL" && event.isPlayerDeath) {
    return (
      <div
        className="absolute -translate-x-1/2 flex flex-col items-center"
        style={{ left: leftPct, top: 0 }}
        title={`Você morreu no min ${event.minute}`}
      >
        <div className="w-5 h-5 rounded-full bg-red-600 border border-red-400 flex items-center justify-center">
          <Skull size={10} className="text-white" />
        </div>
        <div className="w-px h-2 bg-red-700" />
      </div>
    );
  }

  // Abate do jogador — verde brilhante
  if (event.type === "CHAMPION_KILL" && event.isPlayerKill) {
    return (
      <div
        className="absolute -translate-x-1/2 flex flex-col items-center"
        style={{ left: leftPct, top: 0 }}
        title={`Você matou ${event.victimName} no min ${event.minute}`}
      >
        <div className="w-5 h-5 rounded-full bg-emerald-500 border border-emerald-300 flex items-center justify-center">
          <Swords size={10} className="text-white" />
        </div>
        <div className="w-px h-2 bg-emerald-700" />
      </div>
    );
  }

  // Abate aliado (não é o jogador)
  if (event.type === "CHAMPION_KILL" && event.isAllyKill) {
    return (
      <div
        className="absolute -translate-x-1/2"
        style={{ left: leftPct, top: "6px" }}
        title={`${event.killerName} matou ${event.victimName} (min ${event.minute})`}
      >
        <div className="w-3 h-3 rounded-full bg-emerald-800 border border-emerald-600" />
      </div>
    );
  }

  // Abate inimigo (aliado morreu)
  if (event.type === "CHAMPION_KILL" && !event.isAllyKill) {
    return (
      <div
        className="absolute -translate-x-1/2"
        style={{ left: leftPct, top: "6px" }}
        title={`${event.victimName} aliado morreu (min ${event.minute})`}
      >
        <div className="w-3 h-3 rounded-full bg-red-800 border border-red-600" />
      </div>
    );
  }

  // Objetivos
  const cfg = EVENT_CONFIG[event.type];
  if (!cfg) return null;
  const Icon  = cfg.icon;
  const cls   = event.isPlayerTeam ? cfg.allyClass : cfg.enemyClass;
  const label = cfg.label + (event.subType?.includes("ELDER") ? " Ancião" : "");

  return (
    <div
      className="absolute -translate-x-1/2 flex flex-col items-center gap-0.5"
      style={{ left: leftPct, top: 0 }}
      title={`${event.isPlayerTeam ? "✅" : "❌"} ${label} no min ${event.minute}`}
    >
      <div className={`w-5 h-5 rounded-md border border-white/20 flex items-center justify-center text-[9px] font-bold ${cls}`}>
        <Icon size={10} />
      </div>
      <div className={`w-px h-2 ${event.isPlayerTeam ? "bg-emerald-700" : "bg-red-700"}`} />
    </div>
  );
}

export default function TimelineViewer({ events, tippingPoint, gameDurationMin }) {
  const scrollRef = useRef(null);

  if (!events?.length) {
    return (
      <div className="flex items-center justify-center h-20 text-gray-600 text-sm">
        Sem eventos registrados
      </div>
    );
  }

  const totalMin = gameDurationMin ?? Math.max(...events.map(e => e.minute), 1);

  // Filtra apenas eventos "relevantes" para não poluir demais
  const relevant = events.filter(e =>
    ["BARON","DRAGON","HERALD","TOWER","INHIBITOR"].includes(e.type) ||
    (e.type === "CHAMPION_KILL" && (e.isPlayerKill || e.isPlayerDeath)) ||
    (e.type === "CHAMPION_KILL" && e.minute % 3 === 0) // 1 em cada 3 abates comuns
  );

  return (
    <div className="space-y-3">
      {/* Barra de rolagem */}
      <div
        ref={scrollRef}
        className="relative overflow-x-auto rounded-xl bg-surface-700 border border-white/5 p-4"
        style={{ minWidth: 0 }}
      >
        {/* Container interno com largura mínima para permitir rolagem */}
        <div className="relative" style={{ minWidth: `${Math.max(totalMin * 14, 460)}px`, height: "56px" }}>

          {/* Linha central da timeline */}
          <div className="absolute left-0 right-0 h-1 bg-gray-700 rounded-full" style={{ top: "28px" }} />

          {/* Marcadores de minuto a cada 5 min */}
          {Array.from({ length: Math.floor(totalMin / 5) + 1 }, (_, i) => i * 5).map(min => (
            <div
              key={min}
              className="absolute flex flex-col items-center"
              style={{ left: `${(min / totalMin) * 100}%`, top: "22px" }}
            >
              <div className="w-px h-4 bg-gray-600" />
              <span className="text-[9px] text-gray-500 mt-0.5 -translate-x-1/2">{min}</span>
            </div>
          ))}

          {/* Linha do Tipping Point */}
          {tippingPoint && (
            <div
              className="absolute flex flex-col items-center z-10"
              style={{ left: `${(tippingPoint.minute / totalMin) * 100}%`, top: 0, height: "100%" }}
              title={tippingPoint.description}
            >
              <div className="h-full w-0.5 bg-orange-500/70 border-dashed" style={{ borderLeft: "2px dashed #f97316" }} />
              <div className="absolute -top-0.5 -translate-x-1/2 bg-orange-500 text-white text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap font-bold">
                ⚡ {tippingPoint.minute}m
              </div>
            </div>
          )}

          {/* Eventos */}
          <div className="absolute left-0 right-0" style={{ top: "4px" }}>
            {relevant.map((ev, i) => (
              <EventDot key={i} event={ev} totalMin={totalMin} />
            ))}
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500 px-1">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-600 border border-red-400 inline-flex items-center justify-center">
            <Skull size={7} className="text-white" />
          </span>
          Sua morte
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500 border border-emerald-300 inline-flex items-center justify-center">
            <Swords size={7} className="text-white" />
          </span>
          Seu abate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-purple-500 border border-white/20 inline-block" />
          Barão aliado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-purple-800 border border-white/20 inline-block" />
          Barão inimigo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-orange-500 border border-white/20 inline-block" />
          Dragão aliado
        </span>
        {tippingPoint && (
          <span className="flex items-center gap-1.5 text-orange-400">
            <span className="w-px h-3 border-l-2 border-dashed border-orange-500 inline-block" />
            Virada (min {tippingPoint.minute})
          </span>
        )}
      </div>

      {/* Tipping Point description */}
      {tippingPoint && (
        <div className="flex items-start gap-2 bg-orange-900/20 border border-orange-700/30 rounded-xl px-3 py-2.5 text-xs text-orange-300">
          <TriangleAlert size={13} className="shrink-0 mt-0.5 text-orange-400" />
          <span>{tippingPoint.description}</span>
        </div>
      )}
    </div>
  );
}
