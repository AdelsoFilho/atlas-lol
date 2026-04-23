// =============================================================================
// laneDetector.js — Detecção de rota e cálculo de Gold 1v1
//
// Ordem de prioridade para detectar lane:
//   1. participant.teamPosition  (calculado pela Riot — mais confiável)
//   2. participant.individualPosition  (autodeclarado pelo jogador)
//   3. Summoner spells             (fallback heurístico)
//   4. Posição nos primeiros 10 min (fallback por heatmap de frames)
// =============================================================================

"use strict";

// ─── Constantes ──────────────────────────────────────────────────────────────

const SPELL_ID = {
  GHOST:     1,
  EXHAUST:   3,
  FLASH:     4,
  HEAL:      7,
  SMITE:     11,
  TELEPORT:  12,
  CLARITY:   13,
  IGNITE:    14,
  BARRIER:   21,
  MARK:      32,  // ARAM Snowball (não entra no SoloQ, mas por segurança)
};

// Mapeamento API → label interno
const API_TO_LANE = {
  TOP:     "TOP",
  JUNGLE:  "JUNGLE",
  MIDDLE:  "MID",
  MID:     "MID",
  BOTTOM:  "ADC",
  BOT:     "ADC",
  UTILITY: "SUPPORT",
  SUPPORT: "SUPPORT",
};

// Mapeamento inverso: label interno → valor teamPosition da API
const LANE_TO_API = {
  TOP:     "TOP",
  JUNGLE:  "JUNGLE",
  MID:     "MIDDLE",
  ADC:     "BOTTOM",
  SUPPORT: "UTILITY",
};

// ─── Heatmap de posição (fallback) ────────────────────────────────────────────
// O mapa tem ~14820×14820 unidades. Regiões aproximadas:
//   TOP:  x < 5000  e y > 9000
//   BOT:  x > 9000  e y < 5000
//   MID:  |x-y| < 3000 (faixa diagonal)
//   JG:   o resto
const LANE_ZONES = {
  TOP:     (x, y) => x < 5000 && y > 9000,
  ADC:     (x, y) => x > 9000 && y < 5000,
  MID:     (x, y) => Math.abs(x - y) < 3000 && x > 3000 && x < 11000,
};

function detectLaneByPosition(frames, participantId) {
  // Analisa os primeiros 10 minutos (frames 2-10 para evitar base de partida)
  const relevantFrames = frames.slice(2, Math.min(10, frames.length));
  if (!relevantFrames.length) return null;

  const scores = { TOP: 0, ADC: 0, MID: 0, JUNGLE: 0 };

  for (const frame of relevantFrames) {
    const pf  = frame.participantFrames?.[String(participantId)];
    if (!pf?.position) continue;
    const { x, y } = pf.position;

    if (LANE_ZONES.TOP(x, y)) scores.TOP++;
    else if (LANE_ZONES.ADC(x, y)) scores.ADC++;
    else if (LANE_ZONES.MID(x, y)) scores.MID++;
    else scores.JUNGLE++;
  }

  const top = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];
  if (!top || top[1] === 0) return null;

  // Ambíguo se o score dominante é ≤ 40% dos frames — retorna null
  const total = Object.values(scores).reduce((s, v) => s + v, 0);
  if (top[1] / total < 0.4) return null;

  // Jungle é a lane "sobra" — só confirma se score > 50%
  if (top[0] === "JUNGLE" && top[1] / total < 0.5) return null;

  return top[0];
}

// ─── Detecção por summoner spells ─────────────────────────────────────────────

function detectLaneFromSpells(s1, s2) {
  const has = (id) => s1 === id || s2 === id;

  if (has(SPELL_ID.SMITE))   return "JUNGLE";

  // Exhaust/Barrier são quase exclusivos de Support (ou Jungle off-meta)
  if (has(SPELL_ID.EXHAUST) || has(SPELL_ID.BARRIER)) return "SUPPORT";

  // Heal: ADC leva Heal (parceiro de suporte fica com Exhaust)
  if (has(SPELL_ID.HEAL))    return "ADC";

  // Teleport: mais comum no Top, mas Mid também usa
  // Se tem TP E Ignite = Mid. Se tem só TP = Top.
  if (has(SPELL_ID.TELEPORT) && has(SPELL_ID.IGNITE)) return "MID";
  if (has(SPELL_ID.TELEPORT))  return "TOP";

  // Ignite sem TP = Mid ou Top agressivo
  if (has(SPELL_ID.IGNITE))    return "MID";

  return "UNKNOWN";
}

// ─── Função principal: detectLane ─────────────────────────────────────────────
//
// @param participant  Objeto do participante (match V5 info.participants[])
// @param timelineFrames  Array de frames da timeline (opcional, para fallback de posição)
// @returns {string}  "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT" | "UNKNOWN"

function detectLane(participant, timelineFrames = []) {
  // 1. teamPosition (mais confiável)
  const tp = API_TO_LANE[participant.teamPosition?.toUpperCase()];
  if (tp) return tp;

  // 2. individualPosition (autodeclarado)
  const ip = API_TO_LANE[participant.individualPosition?.toUpperCase()];
  if (ip) return ip;

  // 3. Summoner spells
  const spellLane = detectLaneFromSpells(participant.summoner1Id, participant.summoner2Id);
  if (spellLane !== "UNKNOWN") return spellLane;

  // 4. Heatmap de posição nos primeiros frames
  if (timelineFrames.length) {
    const posLane = detectLaneByPosition(timelineFrames, participant.participantId);
    if (posLane) return posLane;
  }

  return "UNKNOWN";
}

// ─── findOpponent ─────────────────────────────────────────────────────────────
//
// Encontra o participantId do oponente direto na mesma rota.
// Estratégia:
//   1. Mesmo teamPosition na API
//   2. Mesmo individualPosition na API
//   3. Mesmos summoner spells
//   4. Heatmap de posição nos primeiros frames
//
// @returns {number|null}

function findOpponent(myParticipant, allParticipants, myLane, timelineFrames = []) {
  if (!myLane || myLane === "UNKNOWN") return null;

  const enemyTeamId = myParticipant.teamId === 100 ? 200 : 100;
  const targetApi   = LANE_TO_API[myLane];
  const enemies     = allParticipants.filter(p => p.teamId === enemyTeamId);

  // 1. teamPosition
  const byTeam = enemies.find(p => p.teamPosition === targetApi);
  if (byTeam) return byTeam.participantId;

  // 2. individualPosition
  const byIndiv = enemies.find(p => p.individualPosition === targetApi);
  if (byIndiv) return byIndiv.participantId;

  // 3. Spells
  const bySpells = enemies.find(
    p => detectLaneFromSpells(p.summoner1Id, p.summoner2Id) === myLane
  );
  if (bySpells) return bySpells.participantId;

  // 4. Heatmap
  if (timelineFrames.length) {
    const opponentByPos = enemies.find(
      p => detectLaneByPosition(timelineFrames, p.participantId) === myLane
    );
    if (opponentByPos) return opponentByPos.participantId;
  }

  return null;
}

// ─── calculateLaneGoldDiff ────────────────────────────────────────────────────
//
// Calcula a diferença de ouro frame a frame entre o jogador e seu oponente de rota.
//
// @param {Array}  timelineFrames  Frames da timeline (timelineData.info.frames)
// @param {number} myParticipantId
// @param {number} opponentParticipantId
// @returns {Array<{ minute, myGold, opponentGold, diff }>}

function calculateLaneGoldDiff(timelineFrames, myParticipantId, opponentParticipantId) {
  return timelineFrames.map((frame, minute) => {
    const myGold  = frame.participantFrames?.[String(myParticipantId)]?.totalGold  ?? 0;
    const oppGold = frame.participantFrames?.[String(opponentParticipantId)]?.totalGold ?? 0;
    return {
      minute,
      myGold,
      opponentGold: oppGold,
      diff: myGold - oppGold,
    };
  });
}

// ─── analyseLaneDiff ─────────────────────────────────────────────────────────
//
// Gera um resumo textual do desempenho na rota comparado ao oponente.

function analyseLaneDiff(laneGoldDiff, myChampion, opponentChampion) {
  if (!laneGoldDiff?.length) return null;

  const peakAdv   = Math.max(...laneGoldDiff.map(d => d.diff));
  const peakDef   = Math.min(...laneGoldDiff.map(d => d.diff));
  const lastDiff  = laneGoldDiff[laneGoldDiff.length - 1]?.diff ?? 0;
  const at15      = laneGoldDiff.find(d => d.minute === 15)?.diff ?? lastDiff;

  const me  = myChampion ?? "Você";
  const opp = opponentChampion ?? "oponente";

  let verdict, detail;

  if (lastDiff >= 2000) {
    verdict = `🏆 Domínio total na rota — ${me} destruiu ${opp}`;
    detail  = `Vantagem de +${lastDiff.toLocaleString("pt-BR")} de ouro ao final. Pico de +${peakAdv.toLocaleString("pt-BR")}.`;
  } else if (lastDiff >= 500) {
    verdict = `✅ Vantagem na rota — ${me} ganhou de ${opp}`;
    detail  = `+${lastDiff.toLocaleString("pt-BR")} de ouro no final. Ganho consistente.`;
  } else if (lastDiff >= -500) {
    verdict = `⚖️ Rota equilibrada`;
    detail  = `Diferença final de ${lastDiff.toLocaleString("pt-BR")} — nem um nem outro dominou.`;
  } else if (lastDiff >= -2000) {
    verdict = `❌ Desvantagem na rota — ${opp} foi melhor`;
    detail  = `${lastDiff.toLocaleString("pt-BR")} de ouro ao final. Pico negativo: ${peakDef.toLocaleString("pt-BR")}.`;
  } else {
    verdict = `💀 Perdeu a rota completamente — ${opp} ganhou com tudo`;
    detail  = `Deficit de ${Math.abs(lastDiff).toLocaleString("pt-BR")} de ouro. Impacto severo no macro.`;
  }

  // Detecta se perdeu rota mas pode ter saído para roaming (gold pessoal cresceu mesmo com desvantagem)
  const earlyDiff = at15;
  const lostEarlyButEvenedLate = earlyDiff < -500 && lastDiff > earlyDiff + 1000;
  const wonEarlyButLostLate    = earlyDiff > 500  && lastDiff < earlyDiff - 1000;

  let trend = null;
  if (lostEarlyButEvenedLate) trend = `Recuperou terreno no mid/late game (+${(lastDiff - earlyDiff).toLocaleString("pt-BR")} de recuperação após min 15).`;
  if (wonEarlyButLostLate)    trend = `Tinha vantagem no min 15 (+${earlyDiff.toLocaleString("pt-BR")}), mas perdeu o domínio no late game.`;

  return { verdict, detail, trend, peakAdv, peakDef, at15, lastDiff };
}

module.exports = { detectLane, detectLaneFromSpells, findOpponent, calculateLaneGoldDiff, analyseLaneDiff };
