"use strict";

// =============================================================================
// warRoomEngine.js — Motor de Inteligência do War Room
//
// Dados disponíveis da Riot Spectator V5 (público, server-side):
//   ✓ puuid, teamId, championId, spell1Id, spell2Id, perks
//   ✗ kills, gold, items, level (não disponíveis via API pública server-side)
//
// Estratégia de "Delta Detection":
//   Usa game time para inferir milestones (níveis 6/11/16, janelas de itens)
//   comparando o gameLength atual com o snapshot anterior (poll de 180s atrás).
// =============================================================================

const { getChampName } = require("./liveSpectator");
const strategies       = require("../data/champion_strategies.json");

// ── Cache de roster resolvido (Nome#Tag) por partida ─────────────────────────
// gameId → { roster: Map<puuid, {gameName, tagLine}>, resolvedAt }
const ROSTER_CACHE = new Map();
const ROSTER_TTL   = 3 * 60 * 60 * 1000; // 3h — duração máxima de uma partida

// ── Cache de snapshots para delta detection ───────────────────────────────────
// puuid → { prevGameSec, currentGameSec, events }
const DELTA_CACHE = new Map();

// ── Estimativa de nível por tempo de jogo (lane avg) ─────────────────────────
const LEVEL_CURVE = [
  [0, 1], [65, 2], [155, 3], [270, 4], [390, 5], [480, 6],
  [600, 7], [750, 8], [900, 9], [1020, 10], [1200, 11],
  [1500, 12], [1800, 13], [2100, 14], [2400, 15], [2700, 16],
  [3000, 17], [3300, 18],
];
const POWER_SPIKE_LEVELS = new Set([6, 11, 16]);

function estimateLevel(gameTimeSec) {
  let level = 1;
  for (const [sec, lvl] of LEVEL_CURVE) {
    if (gameTimeSec >= sec) level = lvl;
    else break;
  }
  return level;
}

// ── Janelas de item (heurística por tempo) ────────────────────────────────────
const ITEM_WINDOWS = [
  { sec: 480,  label: "Primeiro recall — componente comprado" },
  { sec: 900,  label: "Item inicial completado" },
  { sec: 1200, label: "Mítico completado — pico máximo de dano" },
  { sec: 1800, label: "Segundo item core — build em andamento" },
  { sec: 2700, label: "Build quase completa — lethality/crit total" },
];

// ── Identity Resolver ─────────────────────────────────────────────────────────
async function resolveRoster(gameId, participants, riotGetFn, regionAccount) {
  const cached = ROSTER_CACHE.get(String(gameId));
  if (cached && Date.now() - cached.resolvedAt < ROSTER_TTL) {
    return cached.roster;
  }

  const roster = new Map();

  // Resolve em lotes de 5 para não estourar rate limit
  for (let i = 0; i < participants.length; i += 5) {
    const chunk = participants.slice(i, i + 5);
    await Promise.allSettled(
      chunk.map(async (p) => {
        if (!p.puuid) return;
        try {
          const acc = await riotGetFn(
            `https://${regionAccount}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${p.puuid}`
          );
          roster.set(p.puuid, { gameName: acc.gameName ?? "Jogador", tagLine: acc.tagLine ?? "???" });
        } catch {
          roster.set(p.puuid, { gameName: "Jogador", tagLine: "???" });
        }
      })
    );
    if (i + 5 < participants.length) {
      await new Promise(r => setTimeout(r, 250)); // pequena pausa entre lotes
    }
  }

  ROSTER_CACHE.set(String(gameId), { roster, resolvedAt: Date.now() });
  return roster;
}

// ── Inferência de Eventos por Delta de Tempo ──────────────────────────────────
function inferEvents(participants, currentSec, prevSec, roster) {
  const events = [];
  if (prevSec === null || prevSec === undefined) return events;

  const prevLvl = estimateLevel(prevSec);
  const currLvl = estimateLevel(currentSec);

  // Level spikes (aplica a todos os jogadores — níveis são aproximados)
  if (currLvl > prevLvl) {
    for (let lvl = prevLvl + 1; lvl <= currLvl; lvl++) {
      if (!POWER_SPIKE_LEVELS.has(lvl)) continue;
      // Separa por time para diferenciar aliados de inimigos
      for (const team of [100, 200]) {
        const teamPlayers = participants.filter(p => p.teamId === team);
        if (teamPlayers.length === 0) continue;
        const champNames = teamPlayers.map(p => getChampName(p.championId)).join(", ");
        events.push({
          type:  "LEVEL_SPIKE",
          team:  team === 100 ? "blue" : "red",
          level: lvl,
          msg:   `Time ${team === 100 ? "Azul" : "Vermelho"} está atingindo nível ${lvl} — Ultis disponíveis! (${champNames})`,
          ts:    Date.now(),
        });
      }
    }
  }

  // Janelas de item
  for (const w of ITEM_WINDOWS) {
    if (prevSec < w.sec && currentSec >= w.sec) {
      events.push({
        type: "ITEM_WINDOW",
        team: "all",
        msg:  `⚡ ${w.label}`,
        ts:   Date.now(),
      });
    }
  }

  // First blood window (primeiros 5 min — alta probabilidade)
  if (prevSec < 300 && currentSec >= 300) {
    events.push({
      type: "FIRST_BLOOD_WINDOW",
      team: "all",
      msg:  "Janela de Primeira Sangue (5 min) — cuidado com invades e dives.",
      ts:   Date.now(),
    });
  }

  return events;
}

// ── Motor de Counterplay ───────────────────────────────────────────────────────
function buildCounterplay(participants, playerTeamId, gameTimeSec) {
  const tips    = [];
  const enemies = participants.filter(p => p.teamId !== playerTeamId);
  const currLvl = estimateLevel(gameTimeSec);

  for (const enemy of enemies) {
    const champName = getChampName(enemy.championId);
    const strategy  = strategies[champName];
    if (!strategy) continue;

    // Tip de nível atual
    const lvlKey = currLvl >= 16 ? "16" : currLvl >= 11 ? "11" : currLvl >= 6 ? "6" : null;
    if (lvlKey && strategy.levelTriggers?.[lvlKey]) {
      tips.push({
        priority: lvlKey === "16" ? "CRITICAL" : lvlKey === "11" ? "HIGH" : "MEDIUM",
        target:   champName,
        type:     "LEVEL_ALERT",
        advice:   strategy.levelTriggers[lvlKey],
        icon:     "⚠️",
      });
    }

    // Tip geral (sempre mostrar 1 para cada inimigo)
    if (strategy.generalTips?.length > 0) {
      tips.push({
        priority: "LOW",
        target:   champName,
        type:     "GENERAL",
        advice:   strategy.generalTips[0],
        icon:     "💡",
      });
    }
  }

  // Tip de composição global
  const ccCount   = enemies.filter(p => ["Nautilus","Malphite","Leona","Thresh","Blitzcrank","Amumu","Vi"].includes(getChampName(p.championId))).length;
  const diveCount = enemies.filter(p => ["Zed","Talon","Kha'Zix","Rengar","Akali","Katarina","Fizz"].includes(getChampName(p.championId))).length;

  if (ccCount >= 2) {
    tips.unshift({
      priority: "HIGH",
      target:   "Time Inimigo",
      type:     "COMP_WARNING",
      advice:   `Time inimigo tem ${ccCount} campeões de CC pesado. Compre Tenacidade (Sombra de Mercúrio ou Botas de Mercúrio).`,
      icon:     "🛡️",
    });
  }
  if (diveCount >= 2) {
    tips.unshift({
      priority: "HIGH",
      target:   "Time Inimigo",
      type:     "COMP_WARNING",
      advice:   `${diveCount} assassinos de dive no time inimigo. Posicione-se atrás dos tanques em teamfight.`,
      icon:     "⚡",
    });
  }

  // Sort: CRITICAL > HIGH > MEDIUM > LOW, max 8 tips
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return tips
    .sort((a, b) => order[a.priority] - order[b.priority])
    .slice(0, 8);
}

// ── Formata participantes para o frontend ─────────────────────────────────────
function formatParticipants(participants, roster, gameTimeSec) {
  return participants.map(p => {
    const identity = roster?.get(p.puuid) ?? { gameName: "Jogador", tagLine: "???" };
    const champName = getChampName(p.championId);
    const estLevel  = estimateLevel(gameTimeSec);
    return {
      puuid:      p.puuid,
      gameName:   identity.gameName,
      tagLine:    identity.tagLine,
      displayId:  `${identity.gameName}#${identity.tagLine}`,
      rosterFull: identity.tagLine !== "???",
      championId: p.championId,
      champion:   champName,
      team:       p.teamId === 100 ? "blue" : "red",
      teamId:     p.teamId,
      spell1Id:   p.spell1Id ?? null,
      spell2Id:   p.spell2Id ?? null,
      estimatedLevel: estLevel,
      strategy:   strategies[champName] ?? null,
    };
  });
}

// ── Função principal ───────────────────────────────────────────────────────────
async function getWarRoom(puuid, platform, riotGetFn, regionAccount) {
  // 1. Busca partida ao vivo
  const game = await riotGetFn(
    `https://${platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`
  );

  const gameId      = String(game.gameId);
  const gameTimeSec = game.gameLength ?? 0;
  const participants = game.participants ?? [];

  // 2. Resolve roster (Nome#Tag) — cached per gameId
  const roster = await resolveRoster(gameId, participants, riotGetFn, regionAccount);

  // 3. Delta detection
  const delta     = DELTA_CACHE.get(puuid) ?? { prevSec: null };
  const newEvents = inferEvents(participants, gameTimeSec, delta.prevSec, roster);
  DELTA_CACHE.set(puuid, { prevSec: gameTimeSec, ts: Date.now() });

  // 4. Quem é o jogador buscado?
  const player       = participants.find(p => p.puuid === puuid);
  const playerTeamId = player?.teamId ?? 100;

  // 5. Counterplay
  const counterplay = buildCounterplay(participants, playerTeamId, gameTimeSec);

  // 6. Formata participantes
  const formatted = formatParticipants(participants, roster, gameTimeSec);
  const blueTeam  = formatted.filter(p => p.teamId === 100);
  const redTeam   = formatted.filter(p => p.teamId === 200);

  const gameMin = Math.floor(gameTimeSec / 60);
  const gameSec = gameTimeSec % 60;

  return {
    isLive:      true,
    gameId,
    gameTime:    `${String(gameMin).padStart(2, "0")}:${String(gameSec).padStart(2, "0")}`,
    gameLengthSec: gameTimeSec,
    gameMode:    game.gameMode ?? "CLASSIC",
    platformId:  game.platformId ?? platform.toUpperCase(),
    playerTeamId,
    blueTeam,
    redTeam,
    liveEvents:  newEvents,
    counterStrategies: counterplay,
    rosterComplete: [...roster.values()].every(r => r.tagLine !== "???"),
  };
}

// ── Modo simulação ────────────────────────────────────────────────────────────
function getSimulatedWarRoom() {
  const tick    = Math.floor(Date.now() / 1000);
  const gameSec = 820 + (tick % 400); // 13-19 min
  const estLvl  = estimateLevel(gameSec);
  const gameMin = Math.floor(gameSec / 60);
  const gameS   = gameSec % 60;

  const blue = [
    { puuid: "sim-b1", gameName: "Faker",    tagLine: "T1",   champion: "Ahri",      championId: 103, teamId: 100, estimatedLevel: estLvl, spell1Id: 4, spell2Id: 14, rosterFull: true, strategy: strategies["Ahri"]     ?? null },
    { puuid: "sim-b2", gameName: "Keria",    tagLine: "T1",   champion: "Thresh",    championId: 412, teamId: 100, estimatedLevel: estLvl, spell1Id: 4, spell2Id: 3,  rosterFull: true, strategy: strategies["Thresh"]   ?? null },
    { puuid: "sim-b3", gameName: "Zeus",     tagLine: "T1",   champion: "Darius",    championId: 122, teamId: 100, estimatedLevel: estLvl, spell1Id: 4, spell2Id: 14, rosterFull: true, strategy: strategies["Darius"]   ?? null },
    { puuid: "sim-b4", gameName: "Oner",     tagLine: "T1",   champion: "Vi",        championId: 254, teamId: 100, estimatedLevel: estLvl, spell1Id: 4, spell2Id: 11, rosterFull: true, strategy: strategies["Vi"]       ?? null },
    { puuid: "sim-b5", gameName: "Gumayusi", tagLine: "T1",   champion: "Jinx",      championId: 222, teamId: 100, estimatedLevel: estLvl, spell1Id: 4, spell2Id: 7,  rosterFull: true, strategy: strategies["Jinx"]     ?? null },
  ];
  const red = [
    { puuid: "sim-r1", gameName: "Chovy",    tagLine: "GEN",  champion: "Yasuo",     championId: 157, teamId: 200, estimatedLevel: estLvl, spell1Id: 4, spell2Id: 14, rosterFull: true, strategy: strategies["Yasuo"]    ?? null },
    { puuid: "sim-r2", gameName: "Delight",  tagLine: "GEN",  champion: "Nautilus",  championId: 111, teamId: 200, estimatedLevel: estLvl, spell1Id: 4, spell2Id: 3,  rosterFull: true, strategy: strategies["Nautilus"] ?? null },
    { puuid: "sim-r3", gameName: "Doran",    tagLine: "GEN",  champion: "Garen",     championId:  86, teamId: 200, estimatedLevel: estLvl, spell1Id: 4, spell2Id: 12, rosterFull: true, strategy: strategies["Garen"]    ?? null },
    { puuid: "sim-r4", gameName: "Peanut",   tagLine: "GEN",  champion: "Lee Sin",   championId:  64, teamId: 200, estimatedLevel: estLvl, spell1Id: 4, spell2Id: 11, rosterFull: true, strategy: strategies["Lee Sin"]  ?? null },
    { puuid: "sim-r5", gameName: "Peyz",     tagLine: "GEN",  champion: "Caitlyn",   championId:  51, teamId: 200, estimatedLevel: estLvl, spell1Id: 4, spell2Id: 7,  rosterFull: true, strategy: strategies["Caitlyn"]  ?? null },
  ];

  const liveEvents = [];
  if (estLvl >= 6)  liveEvents.push({ type: "LEVEL_SPIKE", team: "all",  msg: `Todos os campeões estão em torno do nível ${estLvl} — Ultis ativas.`, ts: Date.now() });
  if (gameSec >= 900) liveEvents.push({ type: "ITEM_WINDOW", team: "all", msg: "Janela de mítico completado — verifique vantagem de itens.", ts: Date.now() });

  const counter = buildCounterplay(
    [...blue, ...red].map(p => ({ puuid: p.puuid, teamId: p.teamId, championId: p.championId })),
    100,
    gameSec
  );

  return {
    isLive:       true,
    simulated:    true,
    gameId:       "SIM_WAR_001",
    gameTime:     `${String(gameMin).padStart(2,"0")}:${String(gameS).padStart(2,"0")}`,
    gameLengthSec: gameSec,
    gameMode:     "RANKED_SOLO_5x5",
    platformId:   "BR1",
    playerTeamId: 100,
    blueTeam:     blue,
    redTeam:      red,
    liveEvents,
    counterStrategies: counter,
    rosterComplete: true,
  };
}

module.exports = { getWarRoom, getSimulatedWarRoom };
