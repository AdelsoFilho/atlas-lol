// =============================================================================
// lolIcons.js — Utilitários de ícones e formatação para League of Legends
// =============================================================================

// ── Formatação de números ─────────────────────────────────────────────────────

/**
 * Formata número para notação "k" compacta.
 * Ex: 24500 → "24.5k" | 1200 → "1.2k" | 980 → "980"
 */
export function fmtK(n) {
  if (n == null || isNaN(n)) return "–";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

/**
 * Formata dano no formato híbrido: "27% (24.5k)"
 * @param {number} pct       – damageShare (0-100)
 * @param {number} absolute  – damageAbsolute (valor bruto)
 */
export function fmtDamage(pct, absolute) {
  if (pct == null && absolute == null) return "–";
  const pctStr = pct != null ? `${pct}%` : "";
  const absStr = absolute != null ? `(${fmtK(absolute)})` : "";
  if (pctStr && absStr) return `${pctStr} ${absStr}`;
  return pctStr || absStr;
}

// ── Configuração de objetivos ─────────────────────────────────────────────────

/**
 * Mapeamento de objetivos para ícone SVG inline, label e cor.
 * Usamos SVG simples para não depender de pacotes de ícones externos.
 */
export const OBJECTIVE_CONFIG = {
  towerKills: {
    label: "Torres",
    color: "text-yellow-400",
    bgColor: "bg-yellow-900/40",
    borderColor: "border-yellow-700/40",
    // Torre (ícone simplificado)
    svg: (
      `<svg viewBox="0 0 16 16" fill="currentColor">
        <rect x="5" y="1" width="6" height="2" rx="0.5"/>
        <rect x="6" y="3" width="4" height="2" rx="0.5"/>
        <rect x="6.5" y="5" width="3" height="8" rx="0.5"/>
        <rect x="5" y="12" width="6" height="2" rx="0.5"/>
      </svg>`
    ),
  },
  inhibitorKills: {
    label: "Inibidores",
    color: "text-purple-400",
    bgColor: "bg-purple-900/40",
    borderColor: "border-purple-700/40",
    svg: (
      `<svg viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="8" r="5"/>
        <circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
      </svg>`
    ),
  },
  baronKills: {
    label: "Baron",
    color: "text-violet-300",
    bgColor: "bg-violet-900/40",
    borderColor: "border-violet-700/40",
    svg: (
      `<svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 2 L13 6 L11 13 H5 L3 6 Z"/>
        <circle cx="8" cy="8" r="2" fill="rgba(0,0,0,0.4)"/>
      </svg>`
    ),
  },
  dragonKills: {
    label: "Dragões",
    color: "text-orange-400",
    bgColor: "bg-orange-900/40",
    borderColor: "border-orange-700/40",
    svg: (
      `<svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M3 10 C3 6 6 3 8 3 C10 3 13 6 13 10 L11 13 H5 Z"/>
        <path d="M5 4 L3 2 M11 4 L13 2" stroke="currentColor" stroke-width="1" fill="none"/>
      </svg>`
    ),
  },
  heraldKills: {
    label: "Herald",
    color: "text-teal-400",
    bgColor: "bg-teal-900/40",
    borderColor: "border-teal-700/40",
    svg: (
      `<svg viewBox="0 0 16 16" fill="currentColor">
        <ellipse cx="8" cy="9" rx="5" ry="4"/>
        <circle cx="6" cy="7" r="1.2" fill="rgba(0,0,0,0.5)"/>
        <circle cx="10" cy="7" r="1.2" fill="rgba(0,0,0,0.5)"/>
        <path d="M6 12 L8 14 L10 12" fill="none" stroke="currentColor" stroke-width="1"/>
      </svg>`
    ),
  },
  hordeKills: {
    label: "Vastilarvas",
    color: "text-lime-400",
    bgColor: "bg-lime-900/40",
    borderColor: "border-lime-700/40",
    svg: (
      `<svg viewBox="0 0 16 16" fill="currentColor">
        <ellipse cx="5" cy="10" rx="3" ry="2.5"/>
        <ellipse cx="11" cy="10" rx="3" ry="2.5"/>
        <ellipse cx="8" cy="8" rx="2.5" ry="3"/>
        <circle cx="7" cy="7" r="0.8" fill="rgba(0,0,0,0.5)"/>
        <circle cx="9" cy="7" r="0.8" fill="rgba(0,0,0,0.5)"/>
      </svg>`
    ),
  },
};

/**
 * Retorna array de objetivos com count > 0 para exibição no cabeçalho do time.
 * @param {object} teamObjectives – { towerKills, inhibitorKills, baronKills, dragonKills, heraldKills }
 * @returns {Array<{ key, label, color, bgColor, borderColor, count }>}
 */
export function getObjectiveIcons(teamObjectives) {
  if (!teamObjectives) return [];
  return Object.entries(OBJECTIVE_CONFIG)
    .filter(([key]) => (teamObjectives[key] ?? 0) > 0)
    .map(([key, cfg]) => ({
      key,
      label:       cfg.label,
      color:       cfg.color,
      bgColor:     cfg.bgColor,
      borderColor: cfg.borderColor,
      count:       teamObjectives[key],
    }));
}

// ── Multi-kills ───────────────────────────────────────────────────────────────

/**
 * Retorna o maior multi-kill de um jogador, ou null se nenhum.
 * @param {{ pentaKills, quadraKills, tripleKills, doubleKills }} player
 * @returns {{ label: string, color: string } | null}
 */
export function getMultiKillBadge(player) {
  if (!player) return null;
  if (player.pentaKills  > 0) return { label: "PENTA",   color: "text-fuchsia-300 bg-fuchsia-900/50 border-fuchsia-700/50" };
  if (player.quadraKills > 0) return { label: "QUADRA",  color: "text-violet-300  bg-violet-900/50  border-violet-700/50"  };
  if (player.tripleKills > 0) return { label: "TRIPLE",  color: "text-blue-300    bg-blue-900/50    border-blue-700/50"    };
  if (player.doubleKills > 0) return { label: "DOUBLE",  color: "text-sky-300     bg-sky-900/50     border-sky-700/50"     };
  return null;
}

// ── Mapa de tipos de evento da timeline ──────────────────────────────────────

export const EVENT_TYPE_MAP = {
  CHAMPION_KILL:         { label: "Abate",        color: "#ef4444" },
  BUILDING_KILL:         { label: "Estrutura",     color: "#eab308" },
  ELITE_MONSTER_KILL:    { label: "Monstro Elite", color: "#a855f7" },
  ITEM_PURCHASED:        { label: "Item",          color: "#3b82f6" },
  SKILL_LEVEL_UP:        { label: "Habilidade",    color: "#22c55e" },
  LEVEL_UP:              { label: "Level Up",      color: "#06b6d4" },
  WARD_PLACED:           { label: "Ward",          color: "#84cc16" },
  WARD_KILL:             { label: "Ward Destruída", color: "#f97316" },
  TURRET_PLATE_DESTROYED:{ label: "Placa",         color: "#ca8a04" },
  DRAGON_SOUL_GIVEN:     { label: "Soul",          color: "#f97316" },
  GAME_END:              { label: "Fim de Jogo",   color: "#64748b" },
};
