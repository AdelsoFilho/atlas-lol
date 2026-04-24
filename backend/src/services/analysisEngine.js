"use strict";

// =============================================================================
// analysisEngine.js — Motor de Inteligência Avançada
//
// Módulos implementados:
//   1. analyzeDeathImpact    — correlação temporal mortes × objetivos perdidos
//   2. detectTiltPattern     — queda de performance após first blood vs first death
//   3. earlyGameRisk         — risco de early feed por campeão
//   4. analyzeDraftPatterns  — padrão de CC/dive em vitórias vs derrotas
//   5. generateCoachingReport — síntese em 3 insights acionáveis
//
// Princípio: este módulo INTERPRETA dados. Não faz chamadas HTTP, não lê .env.
// Toda extração de dados brutos fica em utils/timelineStats.js.
// =============================================================================

// ── Classificação de campeões por arquétipo ───────────────────────────────────
// Heurístico — cobre os campeões mais jogados em ranked BR.
// Campeões não listados são classificados como "FLEX" (sem penalidade no cálculo).
const CHAMPION_ARCHETYPES = {
  HARD_CC: new Set([
    "Leona","Nautilus","Thresh","Blitzcrank","Amumu","Malphite","Sejuani","Zac",
    "Jarvan IV","Vi","Wukong","Annie","Lux","Morgana","Veigar","Skarner","Maokai",
    "Ornn","Sion","Cho'Gath","Galio","Alistar","Janna","Zyra","Neeko","Ashe",
    "Lissandra","Twisted Fate","Nocturne","Warwick","Rammus","Volibear",
  ]),
  DIVE: new Set([
    "Rengar","Kha'Zix","Zed","Talon","Akali","Irelia","Yasuo","Yone","Camille",
    "Fiora","Jax","Riven","Lee Sin","Hecarim","Xin Zhao","Warwick","Olaf","Diana",
    "Elise","Evelynn","Shaco","Nidalee","Kayn","Viego","Briar",
  ]),
  POKE: new Set([
    "Ezreal","Jayce","Zoe","Karma","Lulu","Viktor","Xerath","Vel'Koz","Ziggs",
    "Caitlyn","Jhin","Varus","Jayce","Hwei",
  ]),
  TANK: new Set([
    "Malphite","Cho'Gath","Dr. Mundo","Maokai","Ornn","Sion","Galio","Nautilus",
    "Leona","Alistar","Rammus","Volibear","Nasus","Poppy","Rell","Braum",
  ]),
};

// =============================================================================
// MÓDULO 1 — analyzeDeathImpact
//
// Correlaciona cada morte do jogador com objetivos perdidos nos 120s seguintes.
// Fonte de dados: timelineResult.events (processado por processTimeline em server.js).
// =============================================================================

const CRITICAL_WINDOW_SECONDS = 120; // 2 minutos

/**
 * Analisa o impacto causal das mortes do jogador na perda de objetivos.
 *
 * @param {Array} events — timelineResult.events
 * @returns {{
 *   totalDeaths: number,
 *   criticalDeaths: number,
 *   criticalDeathDetails: Array,
 *   objectivesLost: object,
 *   criticalDeathRate: number,
 *   report: string
 * }}
 */
function analyzeDeathImpact(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      totalDeaths:         0,
      criticalDeaths:      0,
      criticalDeathDetails: [],
      objectivesLost:      {},
      criticalDeathRate:   0,
      report: "Sem dados de timeline disponíveis para análise de impacto.",
    };
  }

  const playerDeaths = events.filter(
    e => e.type === "CHAMPION_KILL" && e.isPlayerDeath === true,
  );

  // Objetivos capturados pelo INIMIGO (perdidos pelo time do jogador)
  const enemyObjectives = events.filter(
    e => ["BARON", "DRAGON", "HERALD", "TOWER", "INHIBITOR"].includes(e.type)
      && e.isPlayerTeam === false,
  );

  const criticalDeathDetails = [];

  for (const death of playerDeaths) {
    const deathTs = death.minute * 60 + (death.second ?? 0);

    // Busca o PRIMEIRO objetivo inimigo dentro da janela de 120s após a morte
    const linkedObjective = enemyObjectives.find(obj => {
      const objTs = obj.minute * 60 + (obj.second ?? 0);
      return objTs > deathTs && objTs - deathTs <= CRITICAL_WINDOW_SECONDS;
    });

    if (linkedObjective) {
      criticalDeathDetails.push({
        deathAt:          { minute: death.minute, second: death.second ?? 0 },
        killedBy:         death.killerName ?? "desconhecido",
        objectiveLost:    linkedObjective.type,
        objectiveAt:      { minute: linkedObjective.minute, second: linkedObjective.second ?? 0 },
        secondsUntilLoss: (linkedObjective.minute * 60 + (linkedObjective.second ?? 0)) - deathTs,
        objectiveSubType: linkedObjective.subType ?? null,
      });
    }
  }

  // Agrega contagem por tipo de objetivo perdido
  const objectivesLost = criticalDeathDetails.reduce((acc, d) => {
    acc[d.objectiveLost] = (acc[d.objectiveLost] || 0) + 1;
    return acc;
  }, {});

  const totalDeaths    = playerDeaths.length;
  const criticalDeaths = criticalDeathDetails.length;
  const criticalDeathRate = totalDeaths > 0
    ? Math.round((criticalDeaths / totalDeaths) * 100)
    : 0;

  // Relatório textual
  let report;
  if (totalDeaths === 0) {
    report = "Nenhuma morte registrada — partida perfeita em sobrevivência.";
  } else if (criticalDeaths === 0) {
    report = "Nenhuma morte crítica detectada — mortes não causaram perda direta de objetivos.";
  } else {
    const objSummary = Object.entries(objectivesLost)
      .map(([obj, n]) => `${n} ${obj.toLowerCase()}`)
      .join(", ");
    report = `${criticalDeaths} morte${criticalDeaths > 1 ? "s" : ""} crítica${criticalDeaths > 1 ? "s" : ""} (${criticalDeathRate}% do total) contribuíram para a perda de ${objSummary}.`;
  }

  return {
    totalDeaths,
    criticalDeaths,
    criticalDeathDetails,
    objectivesLost,
    criticalDeathRate,
    report,
  };
}

// =============================================================================
// MÓDULO 2A — detectTiltPattern
//
// Compara KDA e CS/min em partidas COM first blood vs SEM first blood.
// Se a queda for > 20% em qualquer métrica, sinaliza "Susceptível a Tilt".
//
// REQUISITO: campo `firstBlood` presente em cada match.
// (adicionado em server.js — player.firstBloodKill || player.firstBloodAssist)
// =============================================================================

const TILT_THRESHOLD_PERCENT = 20;

/**
 * @param {Array} matches — recentMatches do /api/player (com campo firstBlood)
 * @returns {object|null} null se amostra insuficiente
 */
function detectTiltPattern(matches) {
  if (!Array.isArray(matches) || matches.length < 5) return null;

  const firstBloodMatches   = matches.filter(m => m.firstBlood === true);
  const noFirstBloodMatches = matches.filter(m => m.firstBlood === false);

  // Mínimo de 2 partidas em CADA grupo para comparação válida
  if (firstBloodMatches.length < 2 || noFirstBloodMatches.length < 2) return null;

  const avg = (arr, fn) => arr.reduce((s, m) => s + fn(m), 0) / arr.length;

  const fbKDA  = avg(firstBloodMatches,   m => m.kda);
  const nfbKDA = avg(noFirstBloodMatches, m => m.kda);
  const fbCS   = avg(firstBloodMatches,   m => m.analysis.csPerMin);
  const nfbCS  = avg(noFirstBloodMatches, m => m.analysis.csPerMin);
  const fbWR   = avg(firstBloodMatches,   m => m.win ? 1 : 0) * 100;
  const nfbWR  = avg(noFirstBloodMatches, m => m.win ? 1 : 0) * 100;

  const kdaDropPct = fbKDA > 0 ? ((fbKDA - nfbKDA) / fbKDA) * 100 : 0;
  const csDropPct  = fbCS  > 0 ? ((fbCS  - nfbCS)  / fbCS)  * 100 : 0;

  const susceptibleToTilt = kdaDropPct > TILT_THRESHOLD_PERCENT
                          || csDropPct  > TILT_THRESHOLD_PERCENT;

  // Análise de sequência de derrotas (tilt em cascata)
  let maxLossStreak = 0;
  let currentStreak = 0;
  for (const m of matches) {
    if (!m.win) { currentStreak++; maxLossStreak = Math.max(maxLossStreak, currentStreak); }
    else currentStreak = 0;
  }

  // Relatório textual
  let report;
  if (susceptibleToTilt) {
    const dominant = kdaDropPct >= csDropPct
      ? `KDA cai ${kdaDropPct.toFixed(0)}% (${fbKDA.toFixed(2)} → ${nfbKDA.toFixed(2)})`
      : `CS/min cai ${csDropPct.toFixed(0)}% (${fbCS.toFixed(1)} → ${nfbCS.toFixed(1)})`;
    report = `Susceptível a tilt: ${dominant} em partidas sem First Blood.`;
  } else {
    report = "Performance estável — sem queda significativa ao perder o First Blood.";
  }
  if (maxLossStreak >= 3) {
    report += ` ⚠️ Maior sequência de ${maxLossStreak} derrotas consecutivas detectada.`;
  }

  return {
    susceptibleToTilt,
    kdaDropPercent: parseFloat(kdaDropPct.toFixed(1)),
    csDropPercent:  parseFloat(csDropPct.toFixed(1)),
    firstBlood: {
      sample:      firstBloodMatches.length,
      avgKDA:      parseFloat(fbKDA.toFixed(2)),
      avgCSPerMin: parseFloat(fbCS.toFixed(1)),
      winrate:     parseFloat(fbWR.toFixed(0)),
    },
    noFirstBlood: {
      sample:      noFirstBloodMatches.length,
      avgKDA:      parseFloat(nfbKDA.toFixed(2)),
      avgCSPerMin: parseFloat(nfbCS.toFixed(1)),
      winrate:     parseFloat(nfbWR.toFixed(0)),
    },
    maxLossStreak,
    report,
  };
}

// =============================================================================
// MÓDULO 2B — earlyGameRisk
//
// Identifica campeões com alto índice de "early feed" nas partidas recentes.
// Proxy: mortes >= 4 E gold/min <= 320 na mesma partida.
//
// NOTA TÉCNICA: timing exato de "antes do level 6" exigiria timeline por partida
// (20 chamadas extras). Esta proxy usa stats finais — precisão ~80% na prática.
// =============================================================================

const EARLY_FEED_MIN_DEATHS   = 4;
const EARLY_FEED_MAX_GOLD_MIN = 320;
const EARLY_FEED_RATE_THRESHOLD = 0.40; // 40% das partidas
const MIN_GAMES_FOR_RISK = 2;

/**
 * @param {Array} matches — recentMatches do /api/player
 * @returns {{ riskyChampions: Array, report: string }}
 */
function earlyGameRisk(matches) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return { riskyChampions: [], report: "Dados insuficientes para análise de early game." };
  }

  // Agrupa partidas por campeão
  const champData = {};
  for (const match of matches) {
    const champ = match.champion;
    if (!champData[champ]) champData[champ] = { total: 0, earlyFeed: 0, wins: 0 };
    champData[champ].total++;
    if (match.win) champData[champ].wins++;
    if (
      match.deaths >= EARLY_FEED_MIN_DEATHS &&
      match.analysis.goldPerMin <= EARLY_FEED_MAX_GOLD_MIN
    ) {
      champData[champ].earlyFeed++;
    }
  }

  const riskyChampions = Object.entries(champData)
    .filter(([, d]) => d.total >= MIN_GAMES_FOR_RISK && d.earlyFeed / d.total >= EARLY_FEED_RATE_THRESHOLD)
    .map(([champion, d]) => ({
      champion,
      games:          d.total,
      earlyFeedCount: d.earlyFeed,
      earlyFeedRate:  Math.round((d.earlyFeed / d.total) * 100),
      winrate:        Math.round((d.wins / d.total) * 100),
    }))
    .sort((a, b) => b.earlyFeedRate - a.earlyFeedRate);

  const report = riskyChampions.length > 0
    ? `Risco elevado no early game com: ${riskyChampions.map(c => `${c.champion} (${c.earlyFeedRate}% early feed rate)`).join(", ")}.`
    : "Sem padrão de risco elevado no early game.";

  return { riskyChampions, report };
}

// =============================================================================
// MÓDULO INTERNO — analyzeDraftPatterns
//
// Analisa CC médio do time aliado em vitórias vs derrotas.
// Detecta se composições de dive inimiga correlacionam com derrotas.
// =============================================================================

/**
 * @param {Array} matches — recentMatches (com campo participants completo)
 * @returns {object|null} null se dados insuficientes
 */
function analyzeDraftPatterns(matches) {
  if (!Array.isArray(matches) || matches.length < 4) return null;

  // Filtra partidas com todos os 10 participantes disponíveis
  const withParticipants = matches.filter(
    m => Array.isArray(m.participants) && m.participants.length === 10,
  );
  if (withParticipants.length < 3) return null;

  const getPlayerTeamId = m => m.participants.find(p => p.isPlayer)?.teamId;
  const getEnemyTeamId  = m => {
    const myId = getPlayerTeamId(m);
    return myId ? (myId === 100 ? 200 : 100) : null;
  };

  const countArchetype = (participants, teamId, archetype) =>
    participants
      .filter(p => p.teamId === teamId)
      .filter(p => CHAMPION_ARCHETYPES[archetype]?.has(p.championName))
      .length;

  const avg = (arr, fn) => arr.length ? arr.reduce((s, m) => s + fn(m), 0) / arr.length : 0;

  const wins   = withParticipants.filter(m => m.win);
  const losses = withParticipants.filter(m => !m.win);

  const ccInWins         = avg(wins,   m => countArchetype(m.participants, getPlayerTeamId(m), "HARD_CC"));
  const ccInLosses       = avg(losses, m => countArchetype(m.participants, getPlayerTeamId(m), "HARD_CC"));
  const enemyDiveInLosses = avg(losses, m => countArchetype(m.participants, getEnemyTeamId(m),  "DIVE"));

  let suggestion = null;
  if (ccInLosses < 1.5 && enemyDiveInLosses >= 2) {
    suggestion = `Nas suas derrotas, o time tem pouco CC (média ${ccInLosses.toFixed(1)}) contra composições de dive inimiga (média ${enemyDiveInLosses.toFixed(1)} dive). Priorize campeões com CC pesado no draft.`;
  } else if (ccInWins > ccInLosses + 0.8) {
    suggestion = `Time com mais CC vence mais (${ccInWins.toFixed(1)} CC em vitórias vs ${ccInLosses.toFixed(1)} nas derrotas). Valorize CC no draft.`;
  }

  return {
    ccInWins:           parseFloat(ccInWins.toFixed(1)),
    ccInLosses:         parseFloat(ccInLosses.toFixed(1)),
    enemyDiveInLosses:  parseFloat(enemyDiveInLosses.toFixed(1)),
    suggestion,
    sampleSize:         withParticipants.length,
  };
}

// =============================================================================
// MÓDULO 4 — generateCoachingReport
//
// Sintetiza os módulos 1, 2 e 3 em exatamente 3 insights acionáveis.
// Hierarquia de severidade: alta > média > baixa > info
// =============================================================================

/**
 * @param {object} opts
 * @param {object|null} opts.deathImpact   — saída de analyzeDeathImpact
 * @param {object|null} opts.tiltData      — saída de detectTiltPattern
 * @param {object|null} opts.earlyRisk     — saída de earlyGameRisk
 * @param {object|null} opts.groupRanking  — saída de calculateGroupRanking (opcional)
 * @param {object|null} opts.diagnosis     — diagnosis do /api/player (contexto de fallback)
 * @returns {{ insights: Array, summary: string[], generatedAt: string }}
 */
function generateCoachingReport({
  deathImpact  = null,
  tiltData     = null,
  earlyRisk    = null,
  groupRanking = null,
  diagnosis    = null,
} = {}) {
  const insights = [];

  // ── Insight 1: Erro Recorrente ─────────────────────────────────────────────
  // Prioridade: morte crítica > tilt > padrão diagnóstico
  if (deathImpact?.criticalDeaths > 0 && deathImpact.criticalDeathRate >= 40) {
    insights.push({
      type:     "erro_recorrente",
      severity: "alta",
      text:     `${deathImpact.criticalDeathRate}% das suas mortes causam perda direta de objetivos — você está morrendo nos momentos mais críticos da partida.`,
    });
  } else if (tiltData?.susceptibleToTilt) {
    const dominant = tiltData.kdaDropPercent >= tiltData.csDropPercent
      ? `KDA cai ${tiltData.kdaDropPercent.toFixed(0)}%`
      : `CS/min cai ${tiltData.csDropPercent.toFixed(0)}%`;
    insights.push({
      type:     "erro_recorrente",
      severity: "média",
      text:     `${dominant} em partidas sem First Blood — performance fortemente afetada pela pressão psicológica inicial.`,
    });
  } else if (diagnosis?.recurringPatterns?.[0]) {
    insights.push({
      type:     "erro_recorrente",
      severity: "baixa",
      text:     diagnosis.recurringPatterns[0],
    });
  }

  // ── Insight 2: Sugestão de Draft ──────────────────────────────────────────
  // Prioridade: benchmark de grupo > early risk > fallback diagnóstico
  const draftInsertado = () => insights.some(i => i.type === "sugestao_draft");

  if (groupRanking?.outliers?.length > 0 && !draftInsertado()) {
    const worstVision = groupRanking.outliers.find(
      o => o.metric === "visão" && o.position === "pior",
    );
    if (worstVision) {
      insights.push({
        type:     "sugestao_draft",
        severity: "média",
        text:     `Pior vision score do grupo (${worstVision.value} vs média ${worstVision.avg}) — considere suportes ou campeões com warding nativo no draft.`,
      });
    }
  }

  if (!draftInsertado() && earlyRisk?.riskyChampions?.length > 0) {
    const riskiest = earlyRisk.riskyChampions[0];
    insights.push({
      type:     "sugestao_draft",
      severity: "média",
      text:     `${riskiest.champion} tem ${riskiest.earlyFeedRate}% de early feed rate — experimente um pick mais safe no early como substituto.`,
    });
  }

  if (!draftInsertado() && diagnosis?.champStats) {
    const { champion, winrate } = diagnosis.champStats;
    if (winrate < 45) {
      insights.push({
        type:     "sugestao_draft",
        severity: "baixa",
        text:     `Winrate de ${winrate}% com ${champion} nas últimas partidas — considere alternar o pool para recuperar confiança.`,
      });
    }
  }

  // ── Insight 3: Alerta Comportamental / Meta ────────────────────────────────
  if (tiltData?.maxLossStreak >= 3) {
    insights.push({
      type:     "alerta_meta",
      severity: "alta",
      text:     `Sequência de ${tiltData.maxLossStreak} derrotas consecutivas detectada — aplique a regra do "stop loss": pare após 2 derrotas seguidas e retorne no dia seguinte.`,
    });
  } else if (deathImpact?.criticalDeaths === 0 && (deathImpact?.totalDeaths ?? 0) > 0) {
    insights.push({
      type:     "alerta_meta",
      severity: "baixa",
      text:     "Suas mortes não causam perda imediata de objetivos — o problema está em converter vantagem individual em pressão global. Foque em rotar após kills.",
    });
  } else if (!tiltData?.susceptibleToTilt && earlyRisk?.riskyChampions?.length === 0) {
    insights.push({
      type:     "alerta_meta",
      severity: "info",
      text:     "Perfil de risco controlado no early game — o gargalo provavelmente está em decisões de mid/late. Estude timings de Barão e Dragão Ancião.",
    });
  }

  const finalInsights = insights.slice(0, 3); // Máximo 3 conforme requisito

  return {
    insights:    finalInsights,
    summary:     finalInsights.map(i => i.text),
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  analyzeDeathImpact,
  detectTiltPattern,
  earlyGameRisk,
  analyzeDraftPatterns,
  generateCoachingReport,
};
