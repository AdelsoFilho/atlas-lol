"use strict";

// =============================================================================
// groupBenchmark.js — Benchmarking Interno de Grupo (Módulo 3)
//
// Compara as métricas de um jogador com um grupo específico (amigos, time).
// Implementação on-demand: não requer banco de dados.
// O frontend envia os stats de todos os membros já buscados, e este módulo
// faz a comparação e destaca outliers.
//
// Uso via API:
//   POST /api/group-ranking
//   Body: {
//     currentPlayer: { riotId: "Nome#TAG", stats: {...} },
//     groupPlayers:  [{ riotId: "Nome2#TAG", stats: {...} }, ...]
//   }
// =============================================================================

// Métricas comparadas e sua semântica (higherIsBetter determina a direção do ranking)
const METRICS = [
  { key: "winrate",       label: "winrate",         unit: "%", higherIsBetter: true  },
  { key: "kda",           label: "KDA",              unit: "",  higherIsBetter: true  },
  { key: "avgGoldPerMin", label: "gold/min",         unit: "",  higherIsBetter: true  },
  { key: "avgKills",      label: "kills médias",     unit: "",  higherIsBetter: true  },
  { key: "avgDeaths",     label: "mortes médias",    unit: "",  higherIsBetter: false },
  { key: "avgAssists",    label: "assists médias",   unit: "",  higherIsBetter: true  },
];

/**
 * Compara as métricas do jogador atual com a média do grupo.
 * Destaca outliers positivos e negativos.
 *
 * @param {{ riotId: string, stats: object }} currentPlayer
 * @param {Array<{ riotId: string, stats: object }>} groupPlayers
 * @returns {object}
 */
function calculateGroupRanking(currentPlayer, groupPlayers) {
  if (!currentPlayer?.riotId || !currentPlayer?.stats) {
    throw new Error("currentPlayer deve ter riotId e stats.");
  }
  if (!Array.isArray(groupPlayers) || groupPlayers.length === 0) {
    throw new Error("groupPlayers deve ser um array não-vazio.");
  }

  const allPlayers  = [currentPlayer, ...groupPlayers];
  const groupSize   = allPlayers.length;
  const rankings    = {};
  const outliers    = [];

  for (const metric of METRICS) {
    // Filtra jogadores com o campo disponível
    const withValue = allPlayers
      .map(p => ({ riotId: p.riotId, value: p.stats?.[metric.key] ?? null }))
      .filter(v => v.value !== null && typeof v.value === "number");

    if (withValue.length < 2) {
      // Avisa no log mas não quebra o sistema — segue para próxima métrica
      console.warn(`[groupBenchmark] Dados insuficientes para métrica "${metric.key}" — pulando.`);
      continue;
    }

    const sorted = [...withValue].sort((a, b) =>
      metric.higherIsBetter ? b.value - a.value : a.value - b.value,
    );

    const avg          = withValue.reduce((s, v) => s + v.value, 0) / withValue.length;
    const currentEntry = withValue.find(v => v.riotId === currentPlayer.riotId);
    const currentValue = currentEntry?.value ?? null;

    if (currentValue === null) continue;

    const rank        = sorted.findIndex(v => v.riotId === currentPlayer.riotId) + 1;
    const diffFromAvg = currentValue - avg;
    const diffPct     = avg !== 0 ? (diffFromAvg / Math.abs(avg)) * 100 : 0;

    rankings[metric.key] = {
      rank,
      total:        withValue.length,
      value:        currentValue,
      groupAvg:     parseFloat(avg.toFixed(2)),
      diffFromAvg:  parseFloat(diffFromAvg.toFixed(2)),
      diffPercent:  parseFloat(diffPct.toFixed(1)),
      unit:         metric.unit,
    };

    // Outlier positivo: melhor do grupo
    if (rank === 1) {
      outliers.push({
        metric:   metric.label,
        position: "melhor",
        value:    currentValue,
        avg:      parseFloat(avg.toFixed(2)),
        unit:     metric.unit,
      });
    }

    // Outlier negativo: pior do grupo
    if (rank === withValue.length) {
      outliers.push({
        metric:   metric.label,
        position: "pior",
        value:    currentValue,
        avg:      parseFloat(avg.toFixed(2)),
        unit:     metric.unit,
      });
    }
  }

  // Gera frases de destaque legíveis
  const bestOnes  = outliers.filter(o => o.position === "melhor");
  const worstOnes = outliers.filter(o => o.position === "pior");

  const highlights = [];
  if (bestOnes.length > 0) {
    highlights.push(
      `Você tem o melhor ${bestOnes.map(o => o.metric).join(" e ")} do grupo`,
    );
  }
  if (worstOnes.length > 0) {
    highlights.push(
      `Você tem o pior ${worstOnes.map(o => o.metric).join(" e ")} do grupo`,
    );
  }

  // Ranking geral: soma de posições normalizadas (menor = melhor)
  const overallScore = Object.values(rankings).reduce((sum, r) => {
    return sum + (r.rank / r.total); // posição relativa 0..1
  }, 0);
  const metricsCount = Object.keys(rankings).length;
  const overallPercentile = metricsCount > 0
    ? Math.round((1 - overallScore / metricsCount) * 100) // 100 = melhor
    : null;

  return {
    groupSize,
    currentPlayer:     currentPlayer.riotId,
    rankings,
    outliers,
    highlights,
    overallPercentile, // ex: 70 = top 30% do grupo nessa métrica agregada
    report:            highlights.join(" — ") || "Performance próxima à média do grupo.",
  };
}

module.exports = { calculateGroupRanking };
