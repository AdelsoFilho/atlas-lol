// ─── MatchupGrid ──────────────────────────────────────────────────────────────
// Tabela 5v5 com todos os participantes da partida.
// Colunas: Campeão | K/D/A | Gold/min | Dano (% + absoluto) | Badges
// Cabeçalho de time exibe objetivos controlados (torres, dragões, baron, etc.)
// Badges por jogador: CARRY · FEED · TURRET · multi-kill (DOUBLE→PENTA)
// ─────────────────────────────────────────────────────────────────────────────

import { fmtDamage, getObjectiveIcons, getMultiKillBadge } from "../utils/lolIcons";

// ── helpers ───────────────────────────────────────────────────────────────────

function kdaColor(kda) {
  if (kda >= 4)   return "text-emerald-400";
  if (kda >= 2.5) return "text-blue-400";
  if (kda >= 1.5) return "text-yellow-400";
  return "text-red-400";
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

/**
 * Barra de dano com texto híbrido: "27% (24.5k)"
 */
function DamageBar({ pct, absolute }) {
  const label = fmtDamage(pct, absolute);
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full rounded-full bg-red-500/70"
          style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
        />
      </div>
      <span className="text-gray-400 text-xs whitespace-nowrap shrink-0">{label}</span>
    </div>
  );
}

/**
 * Badge genérico reutilizável.
 */
function Badge({ className, children }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold leading-none ${className}`}>
      {children}
    </span>
  );
}

/**
 * Ícones SVG inline para objetivos (sem dependência de lib de ícones).
 * Recebe o "key" de OBJECTIVE_CONFIG e renderiza um pequeno SVG.
 */
function ObjectiveIcon({ objKey, color }) {
  const icons = {
    towerKills: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
        <rect x="5" y="1" width="6" height="2" rx="0.5"/>
        <rect x="6" y="3" width="4" height="2" rx="0.5"/>
        <rect x="6.5" y="5" width="3" height="7" rx="0.5"/>
        <rect x="5" y="12" width="6" height="2" rx="0.5"/>
      </svg>
    ),
    inhibitorKills: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
        <circle cx="8" cy="8" r="5"/>
        <circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
    baronKills: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
        <path d="M8 2 L13 6 L11 13 H5 L3 6 Z"/>
        <circle cx="8" cy="8" r="2" fill="rgba(0,0,0,0.4)"/>
      </svg>
    ),
    dragonKills: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
        <path d="M3 10 C3 6 6 3 8 3 C10 3 13 6 13 10 L11 13 H5 Z"/>
        <path d="M5 4 L3 2 M11 4 L13 2" stroke="currentColor" strokeWidth="1" fill="none"/>
      </svg>
    ),
    heraldKills: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
        <ellipse cx="8" cy="9" rx="5" ry="4"/>
        <circle cx="6" cy="7" r="1.2" fill="rgba(0,0,0,0.5)"/>
        <circle cx="10" cy="7" r="1.2" fill="rgba(0,0,0,0.5)"/>
      </svg>
    ),
    hordeKills: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
        <ellipse cx="5"  cy="10" rx="3"   ry="2.5"/>
        <ellipse cx="11" cy="10" rx="3"   ry="2.5"/>
        <ellipse cx="8"  cy="8"  rx="2.5" ry="3"/>
        <circle  cx="7"  cy="7"  r="0.8"  fill="rgba(0,0,0,0.5)"/>
        <circle  cx="9"  cy="7"  r="0.8"  fill="rgba(0,0,0,0.5)"/>
      </svg>
    ),
  };
  return <span className={color}>{icons[objKey] ?? null}</span>;
}

/**
 * Barra de objetivos do time exibida no cabeçalho.
 */
function ObjectivesBar({ teamObjectives }) {
  const items = getObjectiveIcons(teamObjectives);
  if (!items.length) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {items.map(({ key, label, color, bgColor, borderColor, count }) => (
        <span
          key={key}
          title={`${label}: ${count}`}
          className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${bgColor} ${borderColor} ${color}`}
        >
          <ObjectiveIcon objKey={key} color={color} />
          {count}
        </span>
      ))}
    </div>
  );
}

/**
 * Linha individual de jogador na tabela.
 */
function PlayerRow({ player, isYou }) {
  const multiKill = getMultiKillBadge(player);

  return (
    <tr
      className={`
        border-b border-white/5 last:border-0 transition-colors
        ${isYou
          ? "bg-blue-900/20 border-b-blue-800/30"
          : "hover:bg-white/[0.02]"
        }
      `}
    >
      {/* Campeão + nome */}
      <td className="py-2.5 pl-3 pr-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0
              ${player.teamId === 100
                ? "bg-blue-900/50 text-blue-300 border border-blue-700/40"
                : "bg-red-900/50  text-red-300  border border-red-700/40"
              }
              ${isYou ? "ring-1 ring-blue-400" : ""}
            `}
          >
            {player.championName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-medium truncate leading-none ${isYou ? "text-blue-200" : "text-gray-200"}`}>
              {player.championName}
            </p>
            <p className="text-[10px] text-gray-600 truncate leading-tight mt-0.5">
              {player.name}
              {isYou && <span className="ml-1 text-blue-400 font-semibold">← você</span>}
            </p>
          </div>
        </div>
      </td>

      {/* K/D/A */}
      <td className="py-2.5 px-2 text-center">
        <span className={`text-sm font-bold ${kdaColor(player.kda)}`}>
          {player.kills}/{player.deaths}/{player.assists}
        </span>
        <p className="text-[10px] text-gray-600">KDA {player.kda}</p>
      </td>

      {/* Gold/min */}
      <td className="py-2.5 px-2 text-center hidden sm:table-cell">
        <span className={`text-sm font-medium ${
          player.goldPerMin >= 380 ? "text-emerald-400"
          : player.goldPerMin >= 300 ? "text-gray-300"
          : "text-red-400"
        }`}>
          {player.goldPerMin}
        </span>
        <p className="text-[10px] text-gray-600">g/min</p>
      </td>

      {/* Dano — híbrido: % + absoluto */}
      <td className="py-2.5 pl-2 pr-3 hidden md:table-cell">
        <DamageBar pct={player.damageShare} absolute={player.damageAbsolute} />
      </td>

      {/* Badges: CARRY · FEED · turret · multi-kill */}
      <td className="py-2.5 pr-3 text-right">
        <div className="flex items-center justify-end gap-1 flex-wrap">
          {/* Multi-kill — maior alcançado */}
          {multiKill && (
            <Badge className={multiKill.color}>
              {multiKill.label}
            </Badge>
          )}

          {/* Torres destruídas individualmente */}
          {(player.turretKills ?? 0) > 0 && (
            <Badge className="text-yellow-300 bg-yellow-900/40 border-yellow-700/40">
              <span className="flex items-center gap-0.5">
                <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 inline">
                  <rect x="3.5" y="0.5" width="5" height="1.5" rx="0.3"/>
                  <rect x="4.5" y="2" width="3" height="1.5" rx="0.3"/>
                  <rect x="4.8" y="3.5" width="2.4" height="6" rx="0.3"/>
                  <rect x="3.5" y="9.5" width="5" height="1.5" rx="0.3"/>
                </svg>
                ×{player.turretKills}
              </span>
            </Badge>
          )}

          {/* Carry / Feed */}
          {player.isCarry && (
            <Badge className="text-emerald-300 bg-emerald-900/50 border-emerald-700/50">
              CARRY
            </Badge>
          )}
          {player.isFeed && (
            <Badge className="text-red-300 bg-red-900/50 border-red-700/50">
              FEED
            </Badge>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MatchupGrid({ participants }) {
  if (!participants?.length) {
    return (
      <div className="text-gray-600 text-sm text-center py-6">
        Dados dos participantes indisponíveis.
      </div>
    );
  }

  const blue = participants.filter(p => p.teamId === 100);
  const red  = participants.filter(p => p.teamId === 200);

  // Pega os objetivos do time a partir do primeiro jogador (campo teamObjectives)
  const blueObjectives = blue[0]?.teamObjectives ?? null;
  const redObjectives  = red[0]?.teamObjectives  ?? null;

  return (
    <div className="space-y-3">

      {/* ── Time Azul ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden border border-blue-800/30">
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-900/20 border-b border-blue-800/30 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block shrink-0" />
          <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Time Azul</span>

          {/* Objetivos do time */}
          {blueObjectives && (
            <div className="ml-2">
              <ObjectivesBar teamObjectives={blueObjectives} />
            </div>
          )}

          {/* Resultado */}
          {blue[0]?.win
            ? <span className="ml-auto text-[10px] text-emerald-400 font-semibold">VITÓRIA</span>
            : <span className="ml-auto text-[10px] text-red-400   font-semibold">DERROTA</span>
          }
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/5">
              <th className="py-1.5 pl-3 text-left   text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Campeão</th>
              <th className="py-1.5 px-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider">K/D/A</th>
              <th className="py-1.5 px-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">Gold/min</th>
              <th className="py-1.5 pl-2 text-left   text-[10px] font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">Dano</th>
              <th className="py-1.5 pr-3" />
            </tr>
          </thead>
          <tbody>
            {blue.map(p => (
              <PlayerRow key={p.participantId} player={p} isYou={p.isPlayer} />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Time Vermelho ─────────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden border border-red-800/30">
        <div className="flex items-center gap-2 px-3 py-2 bg-red-900/20 border-b border-red-800/30 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block shrink-0" />
          <span className="text-xs font-semibold text-red-300 uppercase tracking-wider">Time Vermelho</span>

          {/* Objetivos do time */}
          {redObjectives && (
            <div className="ml-2">
              <ObjectivesBar teamObjectives={redObjectives} />
            </div>
          )}

          {/* Resultado */}
          {red[0]?.win
            ? <span className="ml-auto text-[10px] text-emerald-400 font-semibold">VITÓRIA</span>
            : <span className="ml-auto text-[10px] text-red-400   font-semibold">DERROTA</span>
          }
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/5">
              <th className="py-1.5 pl-3 text-left   text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Campeão</th>
              <th className="py-1.5 px-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider">K/D/A</th>
              <th className="py-1.5 px-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">Gold/min</th>
              <th className="py-1.5 pl-2 text-left   text-[10px] font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">Dano</th>
              <th className="py-1.5 pr-3" />
            </tr>
          </thead>
          <tbody>
            {red.map(p => (
              <PlayerRow key={p.participantId} player={p} isYou={p.isPlayer} />
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
