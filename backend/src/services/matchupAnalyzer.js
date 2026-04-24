"use strict";

// =============================================================================
// matchupAnalyzer.js — Análise de Matchups e Kryptonitas
//
// Identifica campeões inimigos que correlacionam com derrotas do jogador.
// Não exige timeline — usa apenas participants dos processedMatches.
//
// Dois níveis de análise:
//   1. Presença inimiga     — quando X está no time inimigo, perco Y%?
//   2. Matchup direto       — jogando com campeão A vs campeão B, WR?
//      (usa todos os 5 inimigos; o laner direto não é distinguível sem timeline)
// =============================================================================

const MIN_APPEARANCES   = 2;   // mínimo de aparições para entrada no ranking
const KRYPTONITE_LOSS   = 60;  // lossRate >= 60% → kryptonita
const STRONGPOINT_WIN   = 65;  // winRate  >= 65% → ponto forte
const TOXIC_MATCHUP_WR  = 35;  // winrate  <= 35% em matchup específico → tóxico

/**
 * Analisa matchups a partir do histórico de partidas.
 *
 * @param {Array} matches — recentMatches (com participants[])
 * @returns {{
 *   kryptonites:    Array,   — inimigos com alta loss rate
 *   strongPoints:   Array,   — inimigos com alta win rate
 *   toxicMatchups:  Array,   — matchup específico (campeão próprio × inimigo) ruim
 *   banPriority:    string[], — top 3 recomendações de ban
 *   summary:        string
 * }}
 */
function analyzeMatchups(matches) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return { kryptonites: [], strongPoints: [], toxicMatchups: [], banPriority: [], summary: "Dados insuficientes." };
  }

  const enemyPresence  = {};   // enemyChampion → { appearances, losses }
  const specificMatchup = {};  // "playerChamp vs enemyChamp" → { wins, games }

  for (const match of matches) {
    if (!Array.isArray(match.participants)) continue;

    const playerPart = match.participants.find(p => p.isPlayer);
    if (!playerPart) continue;

    const enemyTeamId = playerPart.teamId === 100 ? 200 : 100;
    const enemies     = match.participants.filter(p => p.teamId === enemyTeamId);

    for (const enemy of enemies) {
      const ec = enemy.championName;
      if (!ec) continue;

      // ── Presença inimiga ─────────────────────────────────────────────────
      if (!enemyPresence[ec]) enemyPresence[ec] = { appearances: 0, losses: 0 };
      enemyPresence[ec].appearances++;
      if (!match.win) enemyPresence[ec].losses++;

      // ── Matchup direto ───────────────────────────────────────────────────
      const key = `${match.champion} vs ${ec}`;
      if (!specificMatchup[key]) {
        specificMatchup[key] = {
          playerChampion: match.champion,
          enemyChampion:  ec,
          wins:           0,
          games:          0,
        };
      }
      specificMatchup[key].games++;
      if (match.win) specificMatchup[key].wins++;
    }
  }

  // ── Kryptonitas ─────────────────────────────────────────────────────────────
  const kryptonites = Object.entries(enemyPresence)
    .filter(([, s]) => s.appearances >= MIN_APPEARANCES)
    .map(([champion, s]) => ({
      champion,
      appearances: s.appearances,
      lossRate:    Math.round((s.losses / s.appearances) * 100),
      winRate:     Math.round(((s.appearances - s.losses) / s.appearances) * 100),
    }))
    .filter(e => e.lossRate >= KRYPTONITE_LOSS)
    .sort((a, b) => b.lossRate - a.lossRate)
    .slice(0, 5);

  // ── Pontos fortes ────────────────────────────────────────────────────────────
  const strongPoints = Object.entries(enemyPresence)
    .filter(([, s]) => s.appearances >= MIN_APPEARANCES)
    .map(([champion, s]) => ({
      champion,
      appearances: s.appearances,
      winRate:     Math.round(((s.appearances - s.losses) / s.appearances) * 100),
    }))
    .filter(e => e.winRate >= STRONGPOINT_WIN)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 3);

  // ── Matchups tóxicos específicos ─────────────────────────────────────────────
  const toxicMatchups = Object.values(specificMatchup)
    .filter(m => m.games >= MIN_APPEARANCES)
    .map(m => ({
      matchup:        `${m.playerChampion} vs ${m.enemyChampion}`,
      playerChampion: m.playerChampion,
      enemyChampion:  m.enemyChampion,
      winrate:        Math.round((m.wins / m.games) * 100),
      games:          m.games,
      wins:           m.wins,
      recommendation: m.wins === 0
        ? "Banir ou trocar de rota"
        : "Alta prioridade de ban",
    }))
    .filter(m => m.winrate <= TOXIC_MATCHUP_WR)
    .sort((a, b) => a.winrate - b.winrate)
    .slice(0, 5);

  // ── Prioridade de ban ────────────────────────────────────────────────────────
  // Une kryptonitas + matchups tóxicos, remove duplicatas, pega top 3
  const banSet  = new Set();
  const banPrio = [];
  for (const k of [...kryptonites, ...toxicMatchups.map(t => ({ champion: t.enemyChampion }))]) {
    if (!banSet.has(k.champion)) {
      banSet.add(k.champion);
      banPrio.push(k.champion);
    }
    if (banPrio.length >= 3) break;
  }

  // ── Sumário ─────────────────────────────────────────────────────────────────
  const summary = kryptonites.length > 0
    ? `${kryptonites.length} kryptonita(s) identificada(s). Banir prioritariamente: ${banPrio.join(", ")}.`
    : strongPoints.length > 0
      ? `Sem kryptonitas críticas. Você domina matchups contra: ${strongPoints.map(s => s.champion).join(", ")}.`
      : "Amostra insuficiente para padrões de matchup definitivos.";

  return { kryptonites, strongPoints, toxicMatchups, banPriority: banPrio, summary };
}

module.exports = { analyzeMatchups };
