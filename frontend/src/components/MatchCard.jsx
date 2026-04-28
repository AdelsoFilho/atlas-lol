import { ChevronRight, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";

// =============================================================================
// MatchCard — Card de partida no histórico (design Pro Analytics)
//
// Props:
//   match   { matchId, champion, win, kills, deaths, assists, kda,
//             durationMin, analysis, isAnomaly }
//   index   number
//   onClick function
// =============================================================================

// ── Tags automáticas ─────────────────────────────────────────────────────────

function generateTags(match) {
  const { win, durationMin, kda, deaths, kills, assists, analysis, isAnomaly } = match;
  const tags = [];

  if (isAnomaly)                                   tags.push({ label: "#Atípica",           cls: "tag-yellow" });
  if (win && durationMin < 22)                     tags.push({ label: "#EarlyGame",          cls: "tag-green"  });
  if (win && durationMin >= 30 && kda >= 3)        tags.push({ label: "#LateGameCarry",      cls: "tag-blue"   });
  if (deaths >= 10)                                tags.push({ label: "#TiltAlert",          cls: "tag-red"    });
  if (!win && kda >= 3.5)                          tags.push({ label: "#MVPDerrota",         cls: "tag-purple" });
  if (analysis?.csPerMin >= 8)                     tags.push({ label: "#FarmGod",            cls: "tag-yellow" });
  if (analysis?.killParticipation >= 80 && win)    tags.push({ label: "#Teamplayer",         cls: "tag-cyan"   });
  if (kills >= 10 && win)                          tags.push({ label: "#Carrying",           cls: "tag-green"  });
  if (analysis?.goldPerMin >= 500)                 tags.push({ label: "#GoldMachine",        cls: "tag-yellow" });
  if (deaths === 0 && durationMin >= 15)           tags.push({ label: "#Deathless",          cls: "tag-green"  });

  return tags.slice(0, 3);
}

// ── KDA color ────────────────────────────────────────────────────────────────
function kdaColor(k) {
  return k >= 4 ? "text-emerald-400"
       : k >= 2.5 ? "text-blue-400"
       : k >= 1.5 ? "text-yellow-400"
       : "text-neon-red";
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function MatchCard({ match, index, onClick }) {
  const { win, champion, kills, deaths, assists, kda, durationMin, analysis } = match;
  const tags = generateTags(match);

  const borderCls = win
    ? "border-l-emerald-500 border-t-emerald-700/25 border-r-white/5 border-b-white/5"
    : "border-l-neon-red border-t-neon-red/20 border-r-white/5 border-b-white/5";

  const bgCls = win
    ? "bg-emerald-950/10 hover:bg-emerald-950/20"
    : "bg-red-950/8 hover:bg-red-950/15";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-4 px-5 py-4
                  border border-l-4 rounded-xl transition-all duration-200 group
                  hover-glow cursor-pointer ${borderCls} ${bgCls}`}
    >
      {/* Index */}
      <span className="text-slate-700 text-xs font-mono w-5 shrink-0 text-right">{index + 1}</span>

      {/* W/L pill */}
      <span className={`text-xs font-bold font-mono w-5 shrink-0 ${win ? "text-emerald-400" : "text-neon-red"}`}>
        {win ? "V" : "D"}
      </span>

      {/* Champion */}
      <div className="shrink-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-black
                        border ${win
                          ? "bg-electric/10 border-electric/25 text-electric"
                          : "bg-neon-red/10 border-neon-red/20 text-neon-red/80"
                        }`}>
          {champion.slice(0, 2)}
        </div>
      </div>

      {/* Champion name */}
      <div className="w-24 shrink-0 min-w-0">
        <p className="text-slate-200 text-sm font-semibold truncate">{champion}</p>
        <p className="text-slate-600 text-[10px] font-mono">{durationMin}m</p>
      </div>

      {/* KDA */}
      <div className="shrink-0 text-center w-24">
        <p className={`text-base font-bold font-mono ${kdaColor(kda)}`}>
          {kills}/{deaths}/{assists}
        </p>
        <p className="text-slate-600 text-[10px] font-mono">KDA {kda}</p>
      </div>

      {/* Stats micro */}
      <div className="hidden md:flex items-center gap-4 text-xs font-mono text-slate-500">
        {analysis?.csPerMin != null && (
          <span>
            <span className="text-slate-600">CS/m</span>{" "}
            <span className={`font-bold ${analysis.csPerMin >= 7 ? "text-emerald-400" : analysis.csPerMin < 5 ? "text-neon-red" : "text-slate-300"}`}>
              {analysis.csPerMin}
            </span>
          </span>
        )}
        {analysis?.goldPerMin != null && (
          <span>
            <span className="text-slate-600">G/m</span>{" "}
            <span className={`font-bold ${analysis.goldPerMin >= 400 ? "text-yellow-400" : "text-slate-300"}`}>
              {analysis.goldPerMin}
            </span>
          </span>
        )}
        {analysis?.killParticipation != null && (
          <span>
            <span className="text-slate-600">KP</span>{" "}
            <span className="font-bold text-slate-300">{analysis.killParticipation}%</span>
          </span>
        )}
      </div>

      {/* Tags */}
      <div className="hidden lg:flex items-center gap-1.5 flex-1 justify-end">
        {tags.map(({ label, cls }) => (
          <span key={label} className={cls}>{label}</span>
        ))}
      </div>

      {/* Arrow */}
      <ChevronRight
        size={14}
        className="text-slate-700 group-hover:text-electric/60 transition-colors ml-auto shrink-0"
      />
    </button>
  );
}
