// =============================================================================
// dataSynthesizer.js — Prepara o payload enviado ao Gemini
//
// Objetivos:
//  • Máximo contexto útil (aproveitando a janela de 1M tokens)
//  • Payload limpo: sem campos redundantes ou nulos
//  • Grandezas numéricas arredondadas para economizar tokens sem perder precisão
// =============================================================================

"use strict";

// Formata um evento de timeline para texto conciso
function fmtEvent(ev) {
  switch (ev.type) {
    case "CHAMPION_KILL":
      if (ev.isPlayerDeath) return `min ${ev.minute}: Você morreu para ${ev.killerName ?? "?"}`;
      if (ev.isPlayerKill)  return `min ${ev.minute}: Você matou ${ev.victimName ?? "?"}`;
      if (ev.isAllyKill)    return `min ${ev.minute}: ${ev.killerName} (aliado) matou ${ev.victimName}`;
      return                       `min ${ev.minute}: ${ev.victimName ?? "?"} aliado morreu`;
    case "BARON":
      return `min ${ev.minute}: Barão ${ev.isPlayerTeam ? "capturado pelo seu time" : "capturado pelo inimigo"}`;
    case "DRAGON":
      return `min ${ev.minute}: Dragão${ev.subType?.includes("ELDER") ? " Ancião" : ""} ${ev.isPlayerTeam ? "capturado" : "PERDIDO"}`;
    case "HERALD":
      return `min ${ev.minute}: Herald ${ev.isPlayerTeam ? "capturado" : "perdido"}`;
    case "TOWER":
      return `min ${ev.minute}: Torre ${ev.lane ?? ""} ${ev.isPlayerTeam ? "destruída (seu time)" : "perdida"}`;
    case "INHIBITOR":
      return `min ${ev.minute}: Inibidor ${ev.isPlayerTeam ? "destruído" : "perdido"}`;
    default:
      return null;
  }
}

/**
 * Monta o payload completo para o Gemini.
 *
 * @param {object} opts
 * @param {object}      opts.matchData      Resposta bruta da Riot Match V5
 * @param {object|null} opts.timelineResult Resultado de processTimeline() + laneDetector
 * @param {string}      opts.puuid          PUUID do jogador analisado
 * @param {object|null} opts.ruleAnalysis   Objeto { positives, negatives, verdict } da engine local
 */
function synthesize({ matchData, timelineResult, puuid, ruleAnalysis = null }) {
  const info    = matchData.info;
  const player  = info.participants.find(p => p.puuid === puuid);
  if (!player) throw new Error("Jogador não encontrado nos participantes.");

  const durMin   = info.gameDuration / 60;
  const cs       = player.totalMinionsKilled + player.neutralMinionsKilled;
  const teamKills = info.participants
    .filter(p => p.teamId === player.teamId)
    .reduce((s, p) => s + p.kills, 0);

  // ── Resumo do jogador ────────────────────────────────────────────────────
  const playerSummary = {
    champion:          player.championName,
    result:            player.win ? "VITÓRIA" : "DERROTA",
    durationMin:       Math.round(durMin),
    kills:             player.kills,
    deaths:            player.deaths,
    assists:           player.assists,
    kda:               parseFloat(((player.kills + player.assists) / Math.max(1, player.deaths)).toFixed(2)),
    csPerMin:          parseFloat((cs / durMin).toFixed(1)),
    goldPerMin:        Math.round(player.goldEarned / durMin),
    totalGold:         player.goldEarned,
    totalDamage:       player.totalDamageDealtToChampions,
    damageToTurrets:   player.damageDealtToTurrets,
    visionScore:       player.visionScore,
    killParticipation: teamKills > 0 ? `${Math.round(((player.kills + player.assists) / teamKills) * 100)}%` : "0%",
    firstBlood:        player.firstBloodKill || player.firstBloodAssist || false,
    pentaKills:        player.pentaKills || 0,
    quadraKills:       player.quadraKills || 0,
  };

  // ── Composição dos times ─────────────────────────────────────────────────
  const makeTeam = (teamId) => info.participants
    .filter(p => p.teamId === teamId)
    .map(p => ({
      champion:    p.championName,
      kda:         `${p.kills}/${p.deaths}/${p.assists}`,
      goldEarned:  p.goldEarned,
      damage:      p.totalDamageDealtToChampions,
      vision:      p.visionScore,
      isPlayer:    p.puuid === puuid,
    }));

  const teams = {
    myTeam:    makeTeam(player.teamId),
    enemyTeam: makeTeam(player.teamId === 100 ? 200 : 100),
    myTeamWon: player.win,
  };

  // ── Contexto de rota ─────────────────────────────────────────────────────
  const laneContext = timelineResult?.lane ? {
    lane:              timelineResult.lane,
    opponentChampion:  timelineResult.opponentChampion ?? "desconhecido",
    opponentName:      timelineResult.opponentName ?? null,
    verdict:           timelineResult.laneAnalysis?.verdict ?? null,
    goldDiffAt15:      timelineResult.laneAnalysis?.at15 ?? null,
    peakAdvantage:     timelineResult.laneAnalysis?.peakAdv ?? null,
    peakDeficit:       timelineResult.laneAnalysis?.peakDef ?? null,
    trend:             timelineResult.laneAnalysis?.trend ?? null,
    // Serie completa minuto a minuto para análise detalhada
    goldDiffTimeline:  (timelineResult.laneGoldDiff ?? []).map(d => ({ min: d.minute, diff: d.diff })),
  } : null;

  // ── Gold diff do time (minuto a minuto) ──────────────────────────────────
  const teamGoldTimeline = (timelineResult?.goldDiffs ?? []).map(d => ({
    min:  d.minute,
    diff: d.diff,
  }));

  // ── Tipping point ────────────────────────────────────────────────────────
  const tippingPoint = timelineResult?.tippingPoint ?? null;

  // ── Eventos chave (formato legível para o modelo) ────────────────────────
  const keyEvents = (timelineResult?.events ?? [])
    .filter(ev =>
      ev.isPlayerDeath || ev.isPlayerKill ||
      ["BARON", "DRAGON", "HERALD", "TOWER", "INHIBITOR"].includes(ev.type)
    )
    .map(fmtEvent)
    .filter(Boolean);

  // ── Análise local (engine de regras) — contexto adicional ───────────────
  const ruleContext = ruleAnalysis ? {
    positives: ruleAnalysis.positives,
    negatives: ruleAnalysis.negatives,
    verdict:   ruleAnalysis.verdict,
  } : null;

  // ── Payload final ────────────────────────────────────────────────────────
  const payload = { playerSummary, teams, laneContext, teamGoldTimeline, tippingPoint, keyEvents };
  if (ruleContext) payload.ruleBasedAnalysis = ruleContext;

  return payload;
}

module.exports = { synthesize };
