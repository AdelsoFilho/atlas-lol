"use strict";

// =============================================================================
// dailyQuests.js — Gerador de Missões Diárias
//
// Gera 3 missões dinâmicas baseadas nas fraquezas detectadas nas últimas
// 10 partidas. Hierarquia: severidade calculada → preenche com hábitos gerais.
// =============================================================================

// ── Catálogo de missões disponíveis ──────────────────────────────────────────

const CATALOG = {
  vision: {
    questKey: "vision",
    title:    "Olho de Águia",
    icon:     "👁️",
    category: "Controle de Mapa",
    desc:     (t) => `Manter >${t} visão/min nas próximas 3 partidas`,
    howTo:    "Compre Control Wards a cada recall. Use o Trinket no início de cada drake/barão.",
    reward:   { label: "Badge: Sentinela", xp: 150 },
  },
  cs: {
    questKey: "cs",
    title:    "Colheita de Ouro",
    icon:     "⚔️",
    category: "Farm",
    desc:     (t) => `Farmar >${t} CS/min nas próximas 3 partidas`,
    howTo:    "Não cancele animações de ataque. Meta: errar < 5 CS por wave até o min 15.",
    reward:   { label: "Badge: Farmer de Elite", xp: 120 },
  },
  survival: {
    questKey: "survival",
    title:    "Fantasma da Rift",
    icon:     "🛡️",
    category: "Segurança",
    desc:     (t) => `Morrer menos de ${t}x por partida nas próximas 3 partidas`,
    howTo:    "Recue quando HP < 30%. Nunca fique estendido sem visão do jungleiro inimigo.",
    reward:   { label: "Badge: Sobrevivente", xp: 180 },
  },
  objectives: {
    questKey: "objectives",
    title:    "Caçador de Objetivos",
    icon:     "🐉",
    category: "Macro",
    desc:     (t) => `Atingir >${t}% de kill participation nas próximas 3 partidas`,
    howTo:    "Após kill na rota, verifique o mapa. Drakes e Herald disponíveis → rotar.",
    reward:   { label: "Badge: Macro Master", xp: 140 },
  },
  kda: {
    questKey: "kda",
    title:    "Duelist Master",
    icon:     "⚡",
    category: "Combate",
    desc:     (t) => `Manter KDA >${t} nas próximas 3 partidas`,
    howTo:    "Só entre em duelos favoráveis. Se inimigo tem HP > 60% e você < 60%, recue.",
    reward:   { label: "Badge: Duelist", xp: 130 },
  },
  tilt: {
    questKey: "tilt",
    title:    "Mente de Aço",
    icon:     "🧘",
    category: "Mentalidade",
    desc:     () => "Completar 2 partidas seguidas sem fechar o cliente após derrota",
    howTo:    "Após derrota, faça pausa de 10 min. Anote UM erro cometido antes de jogar de novo.",
    reward:   { label: "Badge: Resiliência", xp: 200 },
  },
  gold: {
    questKey: "gold",
    title:    "Midas Touch",
    icon:     "🪙",
    category: "Eficiência",
    desc:     (t) => `Manter >${t} gold/min nas próximas 3 partidas`,
    howTo:    "Minimize tempo sem farm. Recall sempre com gold suficiente para um item completo.",
    reward:   { label: "Badge: Alquimista", xp: 110 },
  },
};

// Alvos padrão por métrica
const DEFAULT_TARGETS = {
  vision:     1.2,
  cs:         7.0,
  survival:   3,    // mortes
  kda:        3.0,
  objectives: 55,   // % kill participation
  gold:       350,  // gold/min
  tilt:       null,
};

/**
 * Gera 3 missões diárias baseadas nas fraquezas das últimas 10 partidas.
 *
 * @param {Array} matches — recentMatches do PLAYER_CACHE
 * @returns {{ quests: Array, generatedAt: string, basedOn: number, stats: object }}
 */
function generateDailyQuests(matches) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return {
      quests:      _fallback(),
      generatedAt: new Date().toISOString(),
      basedOn:     0,
      stats:       null,
    };
  }

  const recent = matches.slice(0, 10);
  const n      = recent.length;

  // ── Médias das últimas 10 partidas ─────────────────────────────────────────
  const avgVPM = _avg(recent, m =>
    m.durationMin > 0 && m.analysis?.visionScore != null
      ? m.analysis.visionScore / m.durationMin
      : null,
  );
  const avgCS  = _avg(recent, m => m.analysis?.csPerMin   ?? null);
  const avgDth = _avg(recent, m => m.deaths               ?? null);
  const avgKDA = _avg(recent, m => m.kda                  ?? null);
  const avgKP  = _avg(recent, m => m.analysis?.killParticipation ?? null);
  const avgGld = _avg(recent, m => m.analysis?.goldPerMin  ?? null);

  // ── Sequência atual de derrotas ────────────────────────────────────────────
  let lossStreak = 0;
  for (const m of recent) {
    if (!m.win) lossStreak++;
    else break;
  }

  // ── Cálculo de fraquezas ───────────────────────────────────────────────────
  const weaknesses = [];

  if (avgVPM !== null && avgVPM < 0.9)
    weaknesses.push({ key: "vision",     score: (0.9 - avgVPM) / 0.9,     current: avgVPM });
  if (avgCS !== null && avgCS < 6.5)
    weaknesses.push({ key: "cs",         score: (6.5 - avgCS) / 6.5,      current: avgCS });
  if (avgDth !== null && avgDth > 4.5)
    weaknesses.push({ key: "survival",   score: (avgDth - 4.5) / 8,       current: avgDth });
  if (avgKDA !== null && avgKDA < 2.5)
    weaknesses.push({ key: "kda",        score: (2.5 - avgKDA) / 2.5,     current: avgKDA });
  if (avgKP !== null && avgKP < 45)
    weaknesses.push({ key: "objectives", score: (45 - avgKP) / 45,        current: avgKP });
  if (avgGld !== null && avgGld < 320)
    weaknesses.push({ key: "gold",       score: (320 - avgGld) / 320,     current: avgGld });
  if (lossStreak >= 2)
    weaknesses.push({ key: "tilt",       score: lossStreak * 0.25,        current: lossStreak });

  weaknesses.sort((a, b) => b.score - a.score);

  // ── Preenche até 3 com fallbacks se precisar ──────────────────────────────
  const fallbackOrder = ["cs", "vision", "objectives", "kda", "survival"];
  const used = new Set(weaknesses.slice(0, 3).map(w => w.key));
  for (const fb of fallbackOrder) {
    if (weaknesses.length >= 3) break;
    if (!used.has(fb)) { weaknesses.push({ key: fb, score: 0, current: null }); used.add(fb); }
  }

  // ── Monta as missões ───────────────────────────────────────────────────────
  const quests = weaknesses.slice(0, 3).map((w, i) => {
    const tpl    = CATALOG[w.key];
    const target = _target(w.key, w.current);
    return {
      id:         i + 1,
      questKey:   w.key,
      title:      tpl.title,
      icon:       tpl.icon,
      category:   tpl.category,
      desc:       tpl.desc(target),
      target,
      howTo:      tpl.howTo,
      reward:     tpl.reward,
      severity:   w.score > 0.45 ? "alta" : w.score > 0.20 ? "média" : "baixa",
      currentAvg: w.current != null ? parseFloat(w.current.toFixed(2)) : null,
    };
  });

  return {
    quests,
    generatedAt: new Date().toISOString(),
    basedOn: n,
    stats: {
      avgVisionPerMin: avgVPM  != null ? parseFloat(avgVPM.toFixed(2))  : null,
      avgCsPerMin:     avgCS   != null ? parseFloat(avgCS.toFixed(1))   : null,
      avgDeaths:       avgDth  != null ? parseFloat(avgDth.toFixed(1))  : null,
      avgKDA:          avgKDA  != null ? parseFloat(avgKDA.toFixed(2))  : null,
      avgKillParticip: avgKP   != null ? parseFloat(avgKP.toFixed(0))   : null,
      avgGoldPerMin:   avgGld  != null ? parseFloat(avgGld.toFixed(0))  : null,
      currentLossStreak: lossStreak,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _avg(arr, fn) {
  const vals = arr.map(fn).filter(v => v != null && !isNaN(v));
  return vals.length === 0 ? null : vals.reduce((s, v) => s + v, 0) / vals.length;
}

function _target(key, current) {
  if (key === "survival") {
    return current != null ? Math.max(1, Math.floor(current - 1.5)) : 3;
  }
  return DEFAULT_TARGETS[key] ?? null;
}

function _fallback() {
  return ["cs", "vision", "objectives"].map((key, i) => {
    const tpl    = CATALOG[key];
    const target = DEFAULT_TARGETS[key];
    return {
      id:         i + 1,
      questKey:   key,
      title:      tpl.title,
      icon:       tpl.icon,
      category:   tpl.category,
      desc:       tpl.desc(target),
      target,
      howTo:      tpl.howTo,
      reward:     tpl.reward,
      severity:   "baixa",
      currentAvg: null,
    };
  });
}

module.exports = { generateDailyQuests };
