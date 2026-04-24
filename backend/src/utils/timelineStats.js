"use strict";

// =============================================================================
// timelineStats.js — Extração de dados temporais da Timeline da Riot
//
// Responsabilidade: camada de acesso a dados brutos da timeline.
// NÃO interpreta, apenas extrai e formata.
// A interpretação de negócio fica em analysisEngine.js.
// =============================================================================

/**
 * Retorna estatísticas de um participante em um minuto específico.
 * Os frames da Riot são indexados por minuto (frame[0] = min 0, frame[15] = min 15).
 *
 * @param {Array}  frames        — timelineData.info.frames
 * @param {number} participantId
 * @param {number} minute        — minuto desejado (índice do frame)
 * @returns {{ cs: number, gold: number, level: number } | null}
 */
function getStatsAtMinute(frames, participantId, minute) {
  if (!Array.isArray(frames) || minute < 0) return null;

  const idx   = Math.min(minute, frames.length - 1);
  const frame = frames[idx];
  const pf    = frame?.participantFrames?.[String(participantId)];

  if (!pf) {
    console.warn(`[timelineStats] participantId=${participantId} não encontrado no frame ${idx}`);
    return null;
  }

  return {
    cs:    (pf.minionsKilled    ?? 0) + (pf.jungleMinionsKilled ?? 0),
    gold:  pf.totalGold         ?? 0,
    level: pf.level             ?? 0,
    xp:    pf.xp                ?? 0,
  };
}

/**
 * Calcula CS/min de um participante até um minuto específico.
 * Retorna 0 se minute === 0 ou se não houver dados.
 *
 * @param {Array}  frames
 * @param {number} participantId
 * @param {number} minute
 * @returns {number}
 */
function csPerMinAtMinute(frames, participantId, minute) {
  if (!minute || minute <= 0) return 0;
  const stats = getStatsAtMinute(frames, participantId, minute);
  if (!stats) return 0;
  return parseFloat((stats.cs / minute).toFixed(1));
}

/**
 * Retorna o minuto em que o jogador atingiu um nível específico.
 * Lê eventos LEVEL_UP da timeline.
 *
 * AVISO: se a Riot não fornecer eventos LEVEL_UP para esta partida,
 * retorna null sem quebrar o fluxo.
 *
 * @param {Array}  frames
 * @param {number} participantId
 * @param {number} targetLevel
 * @returns {number | null}
 */
function getLevelUpMinute(frames, participantId, targetLevel) {
  if (!Array.isArray(frames)) return null;

  for (const frame of frames) {
    for (const event of (frame.events ?? [])) {
      if (
        event.type          === "LEVEL_UP" &&
        event.participantId === participantId &&
        event.level         === targetLevel
      ) {
        return Math.floor(event.timestamp / 60_000);
      }
    }
  }

  // Evento não encontrado — pode ser partida antiga ou bug da API
  console.warn(`[timelineStats] LEVEL_UP level=${targetLevel} não encontrado para participantId=${participantId}`);
  return null;
}

/**
 * Extrai kills e mortes de um participante ANTES de um minuto específico.
 * Útil para análise de early game (antes do level 6).
 *
 * @param {Array}  events         — timelineResult.events (já processados)
 * @param {number} participantId
 * @param {number} beforeMinute
 * @returns {{ kills: number, deaths: number }}
 */
function getKillsDeathsBeforeMinute(events, participantId, beforeMinute) {
  if (!Array.isArray(events)) return { kills: 0, deaths: 0 };

  let kills  = 0;
  let deaths = 0;

  for (const ev of events) {
    if (ev.minute >= beforeMinute) break; // events estão ordenados por minuto
    if (ev.type !== "CHAMPION_KILL") continue;

    if (ev.isPlayerKill  && ev.minute < beforeMinute) kills++;
    if (ev.isPlayerDeath && ev.minute < beforeMinute) deaths++;
  }

  return { kills, deaths };
}

module.exports = {
  getStatsAtMinute,
  csPerMinAtMinute,
  getLevelUpMinute,
  getKillsDeathsBeforeMinute,
};
