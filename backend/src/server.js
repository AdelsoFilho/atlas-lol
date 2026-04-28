const { RIOT_API_KEY, PORT } = require("./config");
const express  = require("express");
const cors     = require("cors");
const axios    = require("axios");
const path     = require("path");
const {
  detectLane,
  findOpponent,
  calculateLaneGoldDiff,
  analyseLaneDiff,
} = require("./utils/laneDetector");
const { analyzeWithGemini } = require("./services/aiCoach");
const { synthesize }        = require("./services/dataSynthesizer");
const {
  analyzeDeathImpact,
  detectTiltPattern,
  earlyGameRisk,
  generateCoachingReport,
} = require("./services/analysisEngine");
const { calculateGroupRanking } = require("./services/groupBenchmark");
const { analyzeMatchups }       = require("./services/matchupAnalyzer");
const { generateDailyQuests }   = require("./services/dailyQuests");
const { getLiveGame, getSimulatedGame } = require("./services/liveSpectator");
const { getWarRoom, getSimulatedWarRoom }       = require("./services/warRoomEngine");
const { sendTestAlert, dispatchWarRoomAlerts }  = require("./services/discordAlerter");
const { updateFromHeaders, getDynamicInterval, getRateLimitStatus } = require("./services/smartPoller");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const REGION_ACCOUNT   = "americas";
const REGION_PLATFORM  = process.env.RIOT_PLATFORM ?? "br1";

// =============================================================================
// CACHE EM MEMÓRIA
// Evita refazer chamadas à Riot para os mesmos dados numa sessão de análise.
// TTL 15 min: suficiente para explorar o dashboard sem risco de dados obsoletos.
// =============================================================================

const MATCH_CACHE    = new Map(); // matchId  → { data, ts }
const TIMELINE_CACHE = new Map(); // matchId  → { data, ts }
const PLAYER_CACHE   = new Map(); // puuid    → { data, ts }
const AI_CACHE       = new Map(); // matchId:puuid → { data, ts }  (TTL 1h — respostas custam quota)
const PUUID_CACHE    = new Map(); // "gameName#tagLine" → { puuid, ts }
const CACHE_TTL      = 15 * 60 * 1000;          // 15 minutos
const AI_CACHE_TTL   = 60 * 60 * 1000;          // 1 hora
const PUUID_TTL      = 15 * 60 * 1000;          // 15 minutos (PUUID não muda)

function cacheGet(store, key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { store.delete(key); return null; }
  return entry.data;
}
function cacheSet(store, key, data) { store.set(key, { data, ts: Date.now() }); }

// Resolve PUUID com cache de 15 min (evita chamadas redundantes à account-v1 durante o polling)
async function resolvePuuid(gameName, tagLine) {
  const riotKey = `${gameName.toLowerCase()}#${tagLine.toLowerCase()}`;
  const hit     = PUUID_CACHE.get(riotKey);
  if (hit && Date.now() - hit.ts < PUUID_TTL) return hit.puuid;
  const { puuid } = await riotGet(
    `https://${REGION_ACCOUNT}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
  );
  PUUID_CACHE.set(riotKey, { puuid, ts: Date.now() });
  return puuid;
}

// Converte "MM:SS" → segundos (para getDynamicInterval em rotas sem gameLengthSec)
function parseGameTimeSec(gameTime) {
  if (!gameTime || typeof gameTime !== "string") return 0;
  const [m, s] = gameTime.split(":").map(Number);
  return (isNaN(m) ? 0 : m) * 60 + (isNaN(s) ? 0 : s);
}

// =============================================================================
// UTILITÁRIOS
// =============================================================================

function log(step, detail = "") {
  console.log(`[${new Date().toISOString()}] ${step}${detail ? " → " + detail : ""}`);
}

async function riotGet(url, params = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await axios.get(url, {
        headers: { "X-Riot-Token": RIOT_API_KEY },
        params,
        timeout: 12_000,
      });
      updateFromHeaders(res.headers); // alimenta o smartPoller com os headers de rate limit
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        const wait = parseInt(err.response.headers["retry-after"] || "1", 10) * 1000 * Math.pow(2, attempt);
        log("429", `aguardando ${wait}ms (tentativa ${attempt + 1})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (status === 404) { const e = new Error("NOT_FOUND"); e.status = 404; throw e; }
      if (status === 403) { const e = new Error("FORBIDDEN"); e.status = 403; throw e; }
      const e = new Error(err.response?.data?.status?.message ?? err.message);
      e.status = status ?? 500;
      throw e;
    }
  }
  throw new Error("Máximo de tentativas atingido.");
}

// Executa `fn(item)` em lotes de `concurrency` simultâneos.
// Fundamental para buscar 20 partidas sem estourar 20 req/s da Riot.
async function fetchConcurrently(items, fn, concurrency = 5) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(fn));
    results.push(...settled);
    // Pequena pausa entre lotes para respeitar o burst limit
    if (i + concurrency < items.length) await new Promise(r => setTimeout(r, 250));
  }
  return results;
}

// =============================================================================
// MOTOR DE ANÁLISE GRANULAR (positivos / negativos / veredito por partida)
// =============================================================================

function analyzeMatch({ player, teamKills, gameDuration }) {
  const { kills, deaths, assists } = player;
  const cs         = player.totalMinionsKilled + player.neutralMinionsKilled;
  const csPerMin   = parseFloat((cs / (gameDuration / 60)).toFixed(1));
  const goldPerMin = parseFloat((player.goldEarned / (gameDuration / 60)).toFixed(0));
  const kda        = parseFloat(((kills + assists) / Math.max(1, deaths)).toFixed(2));
  const damage     = player.totalDamageDealtToChampions;
  const win        = player.win;
  const killParticipation = teamKills > 0 ? Math.round(((kills + assists) / teamKills) * 100) : 0;
  const isAnomaly = (kills === 0 && deaths === 0 && assists === 0 && gameDuration < 600)
                 || (kills >= 15 && deaths === 0) || deaths >= 15;

  const positives = [];
  const negatives = [];

  if (csPerMin >= 8.0)  positives.push(`Farm absurdo (${csPerMin} cs/min) — estava em modo máquina`);
  else if (csPerMin >= 7.0) positives.push(`Farm excelente (${csPerMin} cs/min)`);

  if (goldPerMin >= 500) positives.push(`Economia de ouro excepcional (${goldPerMin} g/min)`);
  else if (goldPerMin >= 420) positives.push(`Bom ritmo de gold (${goldPerMin} g/min)`);

  if (deaths === 0 && gameDuration >= 600) positives.push("Sobrevivência perfeita — zero mortes");
  else if (deaths <= 2) positives.push(`Controle de mortes excelente (apenas ${deaths})`);

  if (killParticipation >= 70) positives.push(`Presença dominante nas brigas (${killParticipation}%)`);
  else if (killParticipation >= 55) positives.push(`Boa participação em objetivos (${killParticipation}%)`);

  if (!win && kda >= 3.0) positives.push(`KDA ${kda} na derrota — o time é que perdeu`);
  else if (win && kda >= 4.0) positives.push(`Carregou o time nas costas (KDA ${kda})`);

  if (damage >= 35_000) positives.push(`Dano devastador (${damage.toLocaleString("pt-BR")})`);
  if (assists >= 15) positives.push(`${assists} assists — presença de suporte de alto elo`);
  else if (assists >= 10) positives.push(`Alta utilidade para o time (${assists} assists)`);

  if (kills === 0 && deaths === 0 && assists === 0) {
    negatives.push("Jogo invisível — impacto absolutamente nulo. Remake ou AFK?");
  } else {
    if (deaths >= 13) negatives.push(`Feedou sem parar — ${deaths} mortes é um desastre completo`);
    else if (deaths >= 8) negatives.push(`Morreu demais (${deaths}x) — previsível e sem ward`);

    if (csPerMin < 4.0) negatives.push(`CS horrível (${csPerMin}/min) — você estava farmando?`);
    else if (csPerMin < 5.5) negatives.push(`Farm fraco (${csPerMin} cs/min) — ouro no chão toda wave`);

    if (goldPerMin < 280) negatives.push(`Economia catastrófica (${goldPerMin} g/min)`);
    else if (goldPerMin < 330) negatives.push(`Gold muito baixo (${goldPerMin} g/min) — sempre 1 item atrás`);

    if (win && kda < 1.0)            negatives.push(`Vitória sorteada (KDA ${kda}) — o time te carregou`);
    else if (!win && kda < 1.5 && deaths >= 5) negatives.push(`KDA negativo (${kda}) — feedou e ainda perdeu`);

    if (killParticipation < 30 && gameDuration > 1_200)
      negatives.push(`Jogo solo (${killParticipation}% participação) — estava na mesma partida que o time?`);
  }

  let verdict;
  if (kills === 0 && deaths === 0 && assists === 0) verdict = "Partida atípica — provável remake ou AFK";
  else if (win && kda >= 4 && csPerMin >= 7)         verdict = "Aula de como jogar — performance de alto elo";
  else if (win && kda >= 3)                           verdict = "Carregou o time — jogo sólido e impactante";
  else if (win && deaths >= 8)                        verdict = "Ganhou, mas feedou bastante — vitória apesar de você";
  else if (win && kda < 1)                            verdict = "Vitória sorteada — o time foi melhor que você";
  else if (win)                                       verdict = "Contribuiu para a vitória — papel cumprido";
  else if (!win && kda >= 3)                          verdict = "Performance individual boa — o time é que afundou";
  else if (!win && deaths >= 10)                      verdict = "Feedou o inimigo até o fim";
  else if (!win && kda < 1)                           verdict = "Morreu mais do que valeu — reveja posicionamento";
  else                                                verdict = "Derrota dentro do esperado";

  return { positives, negatives, verdict, isAnomaly, csPerMin, goldPerMin: Number(goldPerMin), killParticipation, kda, damage };
}

// =============================================================================
// EXTRAÇÃO DE PARTICIPANTES (todos os 10 jogadores da partida)
// =============================================================================

function extractParticipants(info, playerPuuid) {
  const durMin = info.gameDuration / 60;

  // Objetivos por time (apenas disponíveis a nível de time na API da Riot)
  // dragonKills e heraldKills NÃO existem por participante — apenas no agregado do time
  const teamObjectivesMap = {};
  (info.teams ?? []).forEach(t => {
    teamObjectivesMap[t.teamId] = {
      towerKills:     t.objectives?.tower?.kills       ?? 0,
      inhibitorKills: t.objectives?.inhibitor?.kills   ?? 0,
      baronKills:     t.objectives?.baron?.kills       ?? 0,
      dragonKills:    t.objectives?.dragon?.kills      ?? 0,
      heraldKills:    t.objectives?.riftHerald?.kills  ?? 0,
      hordeKills:     t.objectives?.horde?.kills       ?? 0, // Vastilarvas (Voidgrubs) — Season 2024+
    };
  });

  // 1ª passagem: métricas básicas + campos novos
  const base = info.participants.map(p => {
    const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].filter(i => i > 0);
    return {
      participantId:    p.participantId,
      puuid:            p.puuid,
      isPlayer:         p.puuid === playerPuuid,
      teamId:           p.teamId,
      championName:     p.championName,
      name:             p.riotIdGameName || p.summonerName || `P${p.participantId}`,
      kills:            p.kills,
      deaths:           p.deaths,
      assists:          p.assists,
      kda:              parseFloat(((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2)),
      goldEarned:       p.goldEarned,
      goldPerMin:       parseFloat((p.goldEarned / durMin).toFixed(0)),
      totalDamage:      p.totalDamageDealtToChampions,
      damageAbsolute:   p.totalDamageDealtToChampions,         // alias explícito
      visionScore:      p.visionScore,
      items,
      primaryRuneStyle: p.perks?.styles?.[0]?.style ?? null,
      win:              p.win,
      // ── Objetivos por jogador (disponíveis na API por participante) ────────
      turretKills:      p.turretKills    ?? 0,
      inhibitorKills:   p.inhibitorKills ?? 0,
      baronKills:       p.baronKills     ?? 0,
      // ── Multi-kills ────────────────────────────────────────────────────────
      doubleKills:      p.doubleKills    ?? 0,
      tripleKills:      p.tripleKills    ?? 0,
      quadraKills:      p.quadraKills    ?? 0,
      pentaKills:       p.pentaKills     ?? 0,
    };
  });

  // 2ª passagem: damage share + carry / feed + objetivos do time
  return base.map(p => {
    const team        = base.filter(t => t.teamId === p.teamId);
    const teamDmg     = team.reduce((s, t) => s + t.totalDamage, 0);
    const damageShare = teamDmg > 0 ? Math.round((p.totalDamage / teamDmg) * 100) : 0;
    const maxGold     = Math.max(...team.map(t => t.goldPerMin));
    const maxDeaths   = Math.max(...team.map(t => t.deaths));
    const minDmg      = Math.min(...team.map(t => t.totalDamage));
    return {
      ...p,
      damageShare,
      isCarry:        p.goldPerMin === maxGold && p.goldPerMin > 350,
      isFeed:         p.deaths === maxDeaths && p.deaths >= 6 && p.totalDamage <= minDmg * 1.3,
      // Objetivos do time agregados (todos jogadores do time compartilham o mesmo objeto)
      teamObjectives: teamObjectivesMap[p.teamId] ?? null,
    };
  });
}

// =============================================================================
// PADRÕES RECORRENTES
// =============================================================================

function detectPatterns(matches) {
  const n = matches.length;
  if (n < 2) return ["Poucas partidas para detectar padrões."];
  const c = fn => matches.filter(fn).length;
  const patterns = [];

  const highDeath  = c(m => m.deaths >= 7);
  const lowKDA     = c(m => m.kda < 2);
  const lowGold    = c(m => m.analysis.goldPerMin < 350);
  const lowCS      = c(m => m.analysis.csPerMin < 5.5);
  const lowPart    = c(m => m.analysis.killParticipation < 35);
  const lostFed    = c(m => !m.win && m.deaths >= 6);
  const wonCarry   = c(m =>  m.win && m.kda >= 3);

  if (highDeath  >= Math.ceil(n * 0.6)) patterns.push(`Em ${highDeath}/${n} partidas você morreu 7+ vezes — posicionamento de risco crônico`);
  if (lowKDA     >= Math.ceil(n * 0.6)) patterns.push(`KDA abaixo de 2 em ${lowKDA}/${n} jogos — morre sem entregar valor`);
  if (lowGold    >= Math.ceil(n * 0.6)) patterns.push(`Gold/min abaixo de 350 em ${lowGold}/${n} partidas — economy sistematicamente fraca`);
  if (lowCS      >= Math.ceil(n * 0.6)) patterns.push(`Farm ruim em ${lowCS}/${n} jogos — mecânica de last hit precisa de treino`);
  if (lowPart    >= Math.ceil(n * 0.6)) patterns.push(`Participação em brigas < 35% em ${lowPart}/${n} partidas — joga de forma isolada`);
  if (lostFed    >= 2) patterns.push(`${lostFed} derrotas com 6+ mortes — tende a perder quando alimenta`);
  if (wonCarry   >= 2) patterns.push(`${wonCarry}/${n} vitórias carregadas individualmente — potencial real`);
  if (patterns.length === 0) patterns.push("Sem padrões negativos recorrentes — erros parecem situacionais");
  return patterns;
}

// =============================================================================
// DIAGNÓSTICO GERAL
// =============================================================================

function generateDiagnosis({ winrate, kda, avgGoldPerMin, avgDeaths, topChampion, matches }) {
  let title, text, plan;
  const deathWarning = avgDeaths > 6
    ? `⚠️ Posicionamento de Risco: média de ${avgDeaths.toFixed(1)} mortes/partida. Cada morte entrega ouro, XP e tempo ao inimigo.`
    : null;

  if (winrate < 45) {
    title = "Inconsistência Crítica";
    text  = `${winrate}% de winrate — você perde mais do que ganha. Não é falta de mecânica, são decisões de risco mal calculadas.`;
    plan  = [
      "Pare de caçar kills isoladas. A próxima torre vale mais que um abate arriscado.",
      `Você jogou ${topChampion} bastante — domine os matchups antes de expandir o pool.`,
      "Nos replays, assista APENAS as suas mortes e pergunte 'por que eu estava aqui?'",
      "Máximo 3 partidas por dia — fadiga mental aumenta erro de decisão.",
    ];
  } else if (avgGoldPerMin < 350) {
    title = "Economia Deficiente";
    text  = `Gold/min médio de ${Math.round(avgGoldPerMin)} está abaixo do mínimo competitivo. Farm supera kills em elos baixos/médios.`;
    plan  = [
      "Meta imediata: 7 CS/min. Treine last hit 15 min/dia no modo prática.",
      "Só recall quando a onda estiver batendo na torre inimiga.",
      `Com ${topChampion}, priorize farm nos primeiros 15 min antes de auxiliar.`,
      "Não inicie brigas com ondas perto de você — farm primeiro.",
    ];
  } else if (kda < 2.0) {
    title = "Sobrevivência Precária";
    text  = `KDA médio de ${kda} — você morre com frequência sem entregar valor equivalente.`;
    plan  = [
      "Cheque o minimap a cada 5 segundos. Se não vê o jungler, recue.",
      "Após cada morte, pergunte: 'qual informação de mapa eu ignorei?'",
      "Se você for o alvo preferido, compre itens defensivos antes dos ofensivos.",
      `Revise se você usa ${topChampion} para iniciar brigas que não deveria.`,
    ];
  } else {
    title = "Potencial Latente — Problema de Macro";
    text  = `Stats individuais sólidas (WR ${winrate}%, KDA ${kda}). Você ganha a lane mas não converte em objetivos globais.`;
    plan  = [
      "Após uma kill ou torre, cheque o mapa: qual objetivo nasce agora?",
      "Aprenda os timings de spawn de Barão e Dragão.",
      `Assista replays Diamond+ com ${topChampion} — foque nas rotações.`,
      "Use pings ativamente para liderar decisões do time.",
    ];
  }

  const recurringPatterns = detectPatterns(matches);
  const topGames    = matches.filter(m => m.champion === topChampion);
  const othersGames = matches.filter(m => m.champion !== topChampion);

  const champStats = topGames.length > 0 ? {
    champion: topChampion, games: topGames.length,
    wins:    topGames.filter(m => m.win).length,
    winrate: Math.round((topGames.filter(m => m.win).length / topGames.length) * 100),
    avgKDA:  parseFloat((topGames.reduce((s,m) => s+m.kda, 0) / topGames.length).toFixed(2)),
  } : null;

  const othersStats = othersGames.length > 0 ? {
    games:  othersGames.length,
    wins:   othersGames.filter(m => m.win).length,
    winrate: Math.round((othersGames.filter(m => m.win).length / othersGames.length) * 100),
    avgKDA: parseFloat((othersGames.reduce((s,m) => s+m.kda, 0) / othersGames.length).toFixed(2)),
  } : null;

  return { title, text, plan, deathWarning, recurringPatterns, champStats, othersStats };
}

// =============================================================================
// PROCESSAMENTO DE TIMELINE
// =============================================================================

function processTimeline(timelineData, matchData, puuid) {
  const tInfo = timelineData.info;
  const mInfo = matchData.info;

  // Mapa participantId → {champion, teamId, name}
  const pMap = {};
  mInfo.participants.forEach(p => {
    pMap[p.participantId] = {
      champion: p.championName,
      teamId:   p.teamId,
      name:     p.riotIdGameName || p.summonerName,
    };
  });

  const player       = mInfo.participants.find(p => p.puuid === puuid);
  const playerTeamId = player?.teamId ?? 100;
  const playerPId    = player?.participantId;
  const playerTeam   = playerTeamId === 100 ? "blue" : "red";

  const blueIds = mInfo.participants.filter(p => p.teamId === 100).map(p => p.participantId);
  const redIds  = mInfo.participants.filter(p => p.teamId === 200).map(p => p.participantId);

  // Gold diff minuto a minuto (perspectiva do time do jogador)
  const goldDiffs = tInfo.frames.map((frame, i) => {
    const blue = blueIds.reduce((s, id) => s + (frame.participantFrames[String(id)]?.totalGold ?? 0), 0);
    const red  = redIds.reduce( (s, id) => s + (frame.participantFrames[String(id)]?.totalGold ?? 0), 0);
    const diff = playerTeam === "blue" ? blue - red : red - blue;
    return { minute: i, playerGold: playerTeam === "blue" ? blue : red, enemyGold: playerTeam === "blue" ? red : blue, diff };
  });

  // Eventos relevantes de todas os frames
  const events = [];
  tInfo.frames.forEach(frame => {
    frame.events.forEach(ev => {
      const minute = Math.floor(ev.timestamp / 60000);
      const second = Math.floor((ev.timestamp % 60000) / 1000);

      if (ev.type === "CHAMPION_KILL" && ev.killerId > 0) {
        const killer = pMap[ev.killerId];
        const victim = pMap[ev.victimId];
        events.push({
          minute, second, type: "CHAMPION_KILL",
          killerName:    killer?.champion ?? "?",
          victimName:    victim?.champion ?? "?",
          isAllyKill:    killer?.teamId === playerTeamId,
          isPlayerDeath: ev.victimId  === playerPId,
          isPlayerKill:  ev.killerId  === playerPId,
        });
      }

      if (ev.type === "ELITE_MONSTER_KILL") {
        const teamId = ev.killerTeamId ?? (ev.killerId ? pMap[ev.killerId]?.teamId : null);
        events.push({
          minute, second,
          type: ev.monsterType === "BARON_NASHOR" ? "BARON"
              : ev.monsterType === "DRAGON"       ? "DRAGON"
              :                                     "HERALD",
          isPlayerTeam: teamId === playerTeamId,
          subType: ev.monsterSubType ?? null,
        });
      }

      if (ev.type === "BUILDING_KILL") {
        // ev.teamId = dono do edifício (defensor); destruidor = time oposto
        const attackerTeamId = ev.teamId === 100 ? 200 : 100;
        events.push({
          minute, second,
          type: ev.buildingType === "TOWER_BUILDING" ? "TOWER" : "INHIBITOR",
          isPlayerTeam: attackerTeamId === playerTeamId,
          lane: ev.laneType,
        });
      }
    });
  });

  events.sort((a, b) => a.minute !== b.minute ? a.minute - b.minute : a.second - b.second);

  return {
    playerTeam,
    goldDiffs,
    events,
    tippingPoint:   findTippingPoint(goldDiffs, events, playerTeamId),
    gameDurationMin: Math.round(mInfo.gameDuration / 60),
  };
}

// Algoritmo do "Momento da Virada":
// Encontra o primeiro minuto onde o deficit do time do jogador ultrapassa -2000 de ouro
// E não se recupera nos 3 minutos seguintes (deficit sustentado → derrota praticamente confirmada).
// Também busca eventos contextuais (Barão, Dragão Ancião, ace) no intervalo ±2 minutos.
function findTippingPoint(goldDiffs, events, playerTeamId) {
  const DEFICIT  = -2_000;
  const CONFIRM  = 3;

  for (let i = 5; i < goldDiffs.length - CONFIRM; i++) {
    const cur = goldDiffs[i];
    if (cur.diff > DEFICIT) continue;

    const sustained = goldDiffs.slice(i + 1, i + 1 + CONFIRM).every(f => f.diff <= 0);
    if (!sustained) continue;

    const nearby  = events.filter(e => Math.abs(e.minute - cur.minute) <= 2 && ["BARON","DRAGON","HERALD"].includes(e.type));
    const kills   = events.filter(e => Math.abs(e.minute - cur.minute) <= 1  && e.type === "CHAMPION_KILL" && !e.isAllyKill);
    const baron   = nearby.find(e => e.type === "BARON"  && !e.isPlayerTeam);
    const elder   = nearby.find(e => e.type === "DRAGON" && e.subType === "ELDER_DRAGON" && !e.isPlayerTeam);

    let description;
    if (baron)             description = `Barão capturado pelos inimigos no minuto ${cur.minute}`;
    else if (elder)        description = `Dragão Ancião capturado no minuto ${cur.minute} — praticamente decidido`;
    else if (kills.length >= 3) description = `${kills.length} mortes aliadas no minuto ${cur.minute} desencadearam a derrota`;
    else                   description = `Deficit de ${Math.abs(cur.diff).toLocaleString("pt-BR")} de ouro se tornou insuperável no min ${cur.minute}`;

    return { minute: cur.minute, goldDeficit: cur.diff, description };
  }
  return null;
}

// =============================================================================
// ROTA 1: GET /api/player/:riotId
// Busca 20 partidas com concorrência controlada (5 simultâneas) e cache.
// =============================================================================

app.get("/api/player/:riotId", async (req, res) => {
  const rawId = req.params.riotId;
  log("REQUEST", rawId);

  if (!rawId.includes("#"))
    return res.status(400).json({ error: "Formato inválido. Use Nome#TAG" });

  const [gameName, tagLine] = rawId.split("#");

  try {
    // ── PUUID ──────────────────────────────────────────────────────────────
    log("ETAPA 1", `resolvendo PUUID para ${gameName}#${tagLine}`);
    const { puuid, gameName: cName, tagLine: cTag } = await riotGet(
      `https://${REGION_ACCOUNT}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
    );
    log("ETAPA 1 OK", puuid.slice(0, 16) + "…");

    // ── Cache de player ────────────────────────────────────────────────────
    const cached = cacheGet(PLAYER_CACHE, puuid);
    if (cached) {
      log("CACHE HIT", `retornando dados de ${cName}#${cTag} do cache`);
      return res.json(cached);
    }

    // ── 20 Match IDs ───────────────────────────────────────────────────────
    log("ETAPA 2", "buscando últimas 20 partidas");
    const matchIds = await riotGet(
      `https://${REGION_ACCOUNT}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=20`
    );
    log("ETAPA 2 OK", `${matchIds.length} partida(s)`);

    if (!matchIds.length) {
      return res.json({ gameName: cName, tagLine: cTag, stats: null, recentMatches: [], diagnosis: null });
    }

    // ── Fetch concorrente (lotes de 5) ─────────────────────────────────────
    log("ETAPA 3", `buscando detalhes de ${matchIds.length} partidas (lotes de 5)`);

    const fetchMatch = async (matchId) => {
      const hit = cacheGet(MATCH_CACHE, matchId);
      if (hit) return hit;
      const data = await riotGet(`https://${REGION_ACCOUNT}.api.riotgames.com/lol/match/v5/matches/${matchId}`);
      cacheSet(MATCH_CACHE, matchId, data);
      return data;
    };

    const settled = await fetchConcurrently(matchIds, fetchMatch, 5);

    const processedMatches = [];

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      if (result.status !== "fulfilled") { log(`  ✗ ${matchIds[i]}`, result.reason?.message); continue; }

      const matchData  = result.value;
      const info       = matchData.info;
      const player     = info.participants.find(p => p.puuid === puuid);
      if (!player) continue;

      const teamKills = info.participants
        .filter(p => p.teamId === player.teamId)
        .reduce((s, p) => s + p.kills, 0);

      const ar = analyzeMatch({ player, teamKills, gameDuration: info.gameDuration });

      processedMatches.push({
        matchId:      matchIds[i],
        champion:     player.championName,
        win:          player.win,
        kills:        player.kills,
        deaths:       player.deaths,
        assists:      player.assists,
        kda:          ar.kda,
        durationMin:  Math.round(info.gameDuration / 60),
        isAnomaly:    ar.isAnomaly,
        firstBlood:   player.firstBloodKill || player.firstBloodAssist || false,
        analysis: {
          positives:         ar.positives,
          negatives:         ar.negatives,
          verdict:           ar.verdict,
          csPerMin:          ar.csPerMin,
          goldPerMin:        ar.goldPerMin,
          killParticipation: ar.killParticipation,
        },
        // Todos os 10 participantes (para MatchupGrid no frontend)
        participants: extractParticipants(info, puuid),
      });

      log(`  ✓ ${matchIds[i]}`, `${player.win?"V":"D"} ${player.championName} ${player.kills}/${player.deaths}/${player.assists}`);
    }

    if (!processedMatches.length)
      return res.status(422).json({ error: "Nenhuma partida pôde ser processada." });

    // ── Métricas agregadas ─────────────────────────────────────────────────
    const n      = processedMatches.length;
    const wins   = processedMatches.filter(m => m.win).length;
    const totK   = processedMatches.reduce((s, m) => s + m.kills,   0);
    const totD   = processedMatches.reduce((s, m) => s + m.deaths,  0);
    const totA   = processedMatches.reduce((s, m) => s + m.assists, 0);
    const avgGPM = parseFloat((processedMatches.reduce((s, m) => s + m.analysis.goldPerMin, 0) / n).toFixed(0));

    const topChampion = Object.entries(
      processedMatches.reduce((acc, m) => { acc[m.champion] = (acc[m.champion] ?? 0) + 1; return acc; }, {})
    ).sort(([,a],[,b]) => b-a)[0]?.[0] ?? "Desconhecido";

    const stats = {
      gamesPlayed: n, wins, losses: n - wins,
      winrate:     Math.round((wins / n) * 100),
      kda:         parseFloat(((totK + totA) / Math.max(1, totD)).toFixed(2)),
      avgKills:    parseFloat((totK / n).toFixed(1)),
      avgDeaths:   parseFloat((totD / n).toFixed(1)),
      avgAssists:  parseFloat((totA / n).toFixed(1)),
      avgGoldPerMin: avgGPM,
      topChampion,
    };

    const diagnosis = generateDiagnosis({
      winrate: stats.winrate, kda: stats.kda, avgGoldPerMin: avgGPM,
      avgDeaths: stats.avgDeaths, topChampion, matches: processedMatches,
    });

    const payload = { gameName: cName, tagLine: cTag, stats, recentMatches: processedMatches, diagnosis };
    cacheSet(PLAYER_CACHE, puuid, payload);
    log("RESPOSTA", `HTTP 200 → ${n} partidas | WR=${stats.winrate}% | top=${topChampion}`);
    return res.json(payload);

  } catch (err) {
    const s = err.status ?? 500;
    log("ERRO", `${s} — ${err.message}`);
    if (s === 404) return res.status(404).json({ error: "Jogador não encontrado." });
    if (s === 403) return res.status(403).json({ error: "API Key inválida ou expirada." });
    return res.status(s).json({ error: "Erro ao comunicar com a Riot API.", detail: err.message });
  }
});

// =============================================================================
// ROTA 2: GET /api/timeline/:matchId?puuid=xxx
// Busca a timeline detalhada de uma partida sob demanda (lazy loading).
// Cache separado evita rebuscar timelines já carregadas na sessão.
// =============================================================================

app.get("/api/timeline/:matchId", async (req, res) => {
  const { matchId } = req.params;
  const { puuid }   = req.query;

  if (!puuid) return res.status(400).json({ error: "puuid é obrigatório como query param." });

  log("TIMELINE REQUEST", matchId);

  const cacheKey = `${matchId}:${puuid}`;
  const cached   = cacheGet(TIMELINE_CACHE, cacheKey);
  if (cached) { log("TIMELINE CACHE HIT", matchId); return res.json(cached); }

  try {
    // Busca match data (provavelmente já em cache da rota 1)
    let matchData = cacheGet(MATCH_CACHE, matchId);
    if (!matchData) {
      matchData = await riotGet(`https://${REGION_ACCOUNT}.api.riotgames.com/lol/match/v5/matches/${matchId}`);
      cacheSet(MATCH_CACHE, matchId, matchData);
    }

    // Busca timeline (endpoint separado)
    const timelineData = await riotGet(`https://${REGION_ACCOUNT}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline`);

    const result = processTimeline(timelineData, matchData, puuid);

    // ── Detecção de rota + dados 1v1 ─────────────────────────────────────────
    const mParticipants = matchData.info.participants;
    const playerP       = mParticipants.find(p => p.puuid === puuid);

    if (playerP) {
      const frames     = timelineData.info.frames;
      const myLane     = detectLane(playerP, frames);
      const opponentId = findOpponent(playerP, mParticipants, myLane, frames);
      const opponent   = opponentId ? mParticipants.find(p => p.participantId === opponentId) : null;

      result.lane             = myLane;
      result.myParticipantId  = playerP.participantId;
      result.myChampion       = playerP.championName;
      result.opponentId       = opponentId ?? null;
      result.opponentChampion = opponent?.championName ?? null;
      result.opponentName     = opponent?.riotIdGameName ?? opponent?.summonerName ?? null;

      if (opponentId) {
        result.laneGoldDiff = calculateLaneGoldDiff(frames, playerP.participantId, opponentId);
        result.laneAnalysis = analyseLaneDiff(result.laneGoldDiff, playerP.championName, opponent?.championName);
      } else {
        result.laneGoldDiff = null;
        result.laneAnalysis = null;
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    cacheSet(TIMELINE_CACHE, cacheKey, result);
    log("TIMELINE OK", `${result.gameDurationMin}min | ${result.events.length} eventos | lane=${result.lane ?? "?"} | opp=${result.opponentChampion ?? "?"} | tipping=${result.tippingPoint?.minute ?? "N/A"}`);
    return res.json(result);

  } catch (err) {
    const s = err.status ?? 500;
    log("TIMELINE ERRO", `${s} — ${err.message}`);
    return res.status(s).json({ error: "Erro ao buscar timeline.", detail: err.message });
  }
});

// =============================================================================
// ROTA 3: GET /api/ai-coach/:matchId?puuid=xxx
//
// Análise profunda com Groq LLaMA 3.3 70B.
// Reutiliza caches de match e timeline (já populados pela Rota 1 + 2).
// Cache próprio de 1h para não desperdiçar quota.
// =============================================================================

app.get("/api/ai-coach/:matchId", async (req, res) => {
  const { matchId } = req.params;
  const { puuid }   = req.query;

  if (!puuid) return res.status(400).json({ error: "puuid é obrigatório como query param." });

  log("AI-COACH REQUEST", matchId);

  // Cache de IA (1h)
  const cacheKey = `ai:${matchId}:${puuid}`;
  const cached   = (() => {
    const entry = AI_CACHE.get(cacheKey);
    if (!entry) return null;
    if (Date.now() - entry.ts > AI_CACHE_TTL) { AI_CACHE.delete(cacheKey); return null; }
    return entry.data;
  })();
  if (cached) { log("AI CACHE HIT", matchId); return res.json(cached); }

  try {
    // ── 1. Match data (provavelmente já em cache) ──────────────────────────
    let matchData = cacheGet(MATCH_CACHE, matchId);
    if (!matchData) {
      matchData = await riotGet(
        `https://${REGION_ACCOUNT}.api.riotgames.com/lol/match/v5/matches/${matchId}`
      );
      cacheSet(MATCH_CACHE, matchId, matchData);
    }

    // ── 2. Timeline (idem) ─────────────────────────────────────────────────
    const tlKey        = `${matchId}:${puuid}`;
    let timelineResult = cacheGet(TIMELINE_CACHE, tlKey);
    if (!timelineResult) {
      const timelineData = await riotGet(
        `https://${REGION_ACCOUNT}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline`
      );
      timelineResult = processTimeline(timelineData, matchData, puuid);
      const mParts = matchData.info.participants;
      const playerP = mParts.find(p => p.puuid === puuid);
      if (playerP) {
        const frames     = timelineData.info.frames;
        const myLane     = detectLane(playerP, frames);
        const opponentId = findOpponent(playerP, mParts, myLane, frames);
        const opponent   = opponentId ? mParts.find(p => p.participantId === opponentId) : null;
        timelineResult.lane             = myLane;
        timelineResult.myParticipantId  = playerP.participantId;
        timelineResult.myChampion       = playerP.championName;
        timelineResult.opponentId       = opponentId ?? null;
        timelineResult.opponentChampion = opponent?.championName ?? null;
        timelineResult.opponentName     = opponent?.riotIdGameName ?? null;
        if (opponentId) {
          timelineResult.laneGoldDiff = calculateLaneGoldDiff(frames, playerP.participantId, opponentId);
          timelineResult.laneAnalysis = analyseLaneDiff(timelineResult.laneGoldDiff, playerP.championName, opponent?.championName);
        }
      }
      cacheSet(TIMELINE_CACHE, tlKey, timelineResult);
    }

    // ── 3. Análise de regras local (para contexto adicional) ───────────────
    const info   = matchData.info;
    const player = info.participants.find(p => p.puuid === puuid);
    let ruleAnalysis = null;
    if (player) {
      const teamKills = info.participants
        .filter(p => p.teamId === player.teamId)
        .reduce((s, p) => s + p.kills, 0);
      ruleAnalysis = analyzeMatch({ player, teamKills, gameDuration: info.gameDuration });
    }

    // ── 4. Sintetiza payload para o modelo ─────────────────────────────────
    const payload = synthesize({ matchData, timelineResult, puuid, ruleAnalysis });

    log("AI-COACH", `Enviando ${JSON.stringify(payload).length} bytes ao modelo`);

    // ── 5. Chama o modelo de IA ────────────────────────────────────────────
    const analysis = await analyzeWithGemini(payload);

    const result = { ...analysis, matchId, champion: player?.championName, win: player?.win };
    AI_CACHE.set(cacheKey, { data: result, ts: Date.now() });

    log("AI-COACH OK", `matchId=${matchId} | issue="${analysis.mainIssue?.slice(0, 60)}…"`);
    return res.json(result);

  } catch (err) {
    const s = err.status ?? 500;
    log("AI-COACH ERRO", `${s} — ${err.message}`);
    if (err.friendly) {
      return res.status(s).json({ error: err.friendly });
    }
    return res.status(s).json({ error: "Erro na análise de IA.", detail: err.message });
  }
});

// =============================================================================
// ROTA 4: GET /api/analysis/:matchId?puuid=xxx
//
// Correlação mortes × objetivos de uma partida específica.
// Reutiliza TIMELINE_CACHE se disponível — sem custo de API extra.
// =============================================================================

app.get("/api/analysis/:matchId", async (req, res) => {
  const { matchId } = req.params;
  const { puuid }   = req.query;

  if (!puuid) return res.status(400).json({ error: "puuid é obrigatório como query param." });

  log("ANALYSIS REQUEST", matchId);

  try {
    // Reutiliza cache de timeline se já foi buscada pelo frontend
    const cacheKey    = `${matchId}:${puuid}`;
    let timelineResult = cacheGet(TIMELINE_CACHE, cacheKey);

    if (!timelineResult) {
      let matchData = cacheGet(MATCH_CACHE, matchId);
      if (!matchData) {
        matchData = await riotGet(`https://${REGION_ACCOUNT}.api.riotgames.com/lol/match/v5/matches/${matchId}`);
        cacheSet(MATCH_CACHE, matchId, matchData);
      }
      const timelineData = await riotGet(`https://${REGION_ACCOUNT}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline`);
      timelineResult     = processTimeline(timelineData, matchData, puuid);

      const mParticipants = matchData.info.participants;
      const playerP       = mParticipants.find(p => p.puuid === puuid);
      if (playerP) {
        const frames     = timelineData.info.frames;
        const myLane     = detectLane(playerP, frames);
        const opponentId = findOpponent(playerP, mParticipants, myLane, frames);
        const opponent   = opponentId ? mParticipants.find(p => p.participantId === opponentId) : null;
        timelineResult.lane             = myLane;
        timelineResult.myParticipantId  = playerP.participantId;
        timelineResult.myChampion       = playerP.championName;
        timelineResult.opponentId       = opponentId ?? null;
        timelineResult.opponentChampion = opponent?.championName ?? null;
        timelineResult.opponentName     = opponent?.riotIdGameName ?? opponent?.summonerName ?? null;
        if (opponentId) {
          timelineResult.laneGoldDiff = calculateLaneGoldDiff(frames, playerP.participantId, opponentId);
          timelineResult.laneAnalysis = analyseLaneDiff(timelineResult.laneGoldDiff, playerP.championName, opponent?.championName);
        }
      }
      cacheSet(TIMELINE_CACHE, cacheKey, timelineResult);
    }

    const deathImpact = analyzeDeathImpact(timelineResult.events ?? []);
    log("ANALYSIS OK", `matchId=${matchId} | criticalDeaths=${deathImpact.criticalDeaths}/${deathImpact.totalDeaths}`);
    return res.json({ matchId, champion: timelineResult.myChampion ?? null, ...deathImpact });

  } catch (err) {
    const s = err.status ?? 500;
    log("ANALYSIS ERRO", `${s} — ${err.message}`);
    return res.status(s).json({ error: "Erro ao analisar partida.", detail: err.message });
  }
});

// =============================================================================
// ROTA 5: GET /api/coaching-report/:riotId
//
// Relatório de coaching completo: tilt, early risk e síntese.
// Requer que /api/player/:riotId tenha sido chamado antes (usa PLAYER_CACHE).
// =============================================================================

app.get("/api/coaching-report/:riotId", async (req, res) => {
  const rawId = req.params.riotId;

  if (!rawId.includes("#"))
    return res.status(400).json({ error: "Formato inválido. Use Nome#TAG" });

  const [gameName, tagLine] = rawId.split("#");
  log("COACHING-REPORT REQUEST", rawId);

  try {
    // Resolve PUUID para consultar o cache
    const { puuid } = await riotGet(
      `https://${REGION_ACCOUNT}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
    );

    const playerData = cacheGet(PLAYER_CACHE, puuid);
    if (!playerData) {
      return res.status(404).json({
        error: "Dados do jogador não encontrados no cache. Busque o jogador em /api/player/:riotId antes de gerar o relatório.",
      });
    }

    const { recentMatches, diagnosis } = playerData;

    const tiltData = detectTiltPattern(recentMatches);
    const earlyRisk = earlyGameRisk(recentMatches);
    const report   = generateCoachingReport({ tiltData, earlyRisk, diagnosis });

    log("COACHING-REPORT OK", `${rawId} | insights=${report.insights.length} | tilt=${tiltData?.susceptibleToTilt ?? "n/a"}`);
    return res.json({
      riotId: rawId,
      tiltAnalysis: tiltData,
      earlyRiskAnalysis: earlyRisk,
      ...report,
    });

  } catch (err) {
    const s = err.status ?? 500;
    log("COACHING-REPORT ERRO", `${s} — ${err.message}`);
    return res.status(s).json({ error: "Erro ao gerar coaching report.", detail: err.message });
  }
});

// =============================================================================
// ROTA 6: POST /api/group-ranking
//
// Compara métricas do jogador atual com o grupo (amigos/time).
// O frontend envia os stats de todos os membros já buscados.
//
// Body: {
//   currentPlayer: { riotId: "Nome#TAG", stats: { winrate, kda, ... } },
//   groupPlayers:  [{ riotId: "Nome2#TAG", stats: {...} }, ...]
// }
// =============================================================================

app.post("/api/group-ranking", (req, res) => {
  const { currentPlayer, groupPlayers } = req.body ?? {};

  if (!currentPlayer || !currentPlayer.riotId || !currentPlayer.stats) {
    return res.status(400).json({ error: "currentPlayer com riotId e stats é obrigatório." });
  }
  if (!Array.isArray(groupPlayers) || groupPlayers.length === 0) {
    return res.status(400).json({ error: "groupPlayers deve ser um array não-vazio." });
  }

  log("GROUP-RANKING REQUEST", `${currentPlayer.riotId} vs ${groupPlayers.length} jogador(es)`);

  try {
    const result = calculateGroupRanking(currentPlayer, groupPlayers);
    log("GROUP-RANKING OK", result.report);
    return res.json(result);
  } catch (err) {
    log("GROUP-RANKING ERRO", err.message);
    return res.status(400).json({ error: err.message });
  }
});

// =============================================================================
// ROTA 7: GET /api/matchups/:riotId
//
// Análise de matchups e kryptonitas do jogador.
// Requer que /api/player/:riotId tenha sido chamado antes (usa PLAYER_CACHE).
// =============================================================================

app.get("/api/matchups/:riotId", async (req, res) => {
  const rawId = req.params.riotId;
  if (!rawId.includes("#"))
    return res.status(400).json({ error: "Formato inválido. Use Nome#TAG" });

  const [gameName, tagLine] = rawId.split("#");
  log("MATCHUPS REQUEST", rawId);

  try {
    const { puuid } = await riotGet(
      `https://${REGION_ACCOUNT}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
    );

    const playerData = cacheGet(PLAYER_CACHE, puuid);
    if (!playerData) {
      return res.status(404).json({
        error: "Jogador não encontrado no cache. Busque o perfil em /api/player/:riotId primeiro.",
      });
    }

    const result = analyzeMatchups(playerData.recentMatches ?? []);
    log("MATCHUPS OK", `${rawId} | kryptonites=${result.kryptonites.length} | toxicMatchups=${result.toxicMatchups.length}`);
    return res.json({ riotId: rawId, ...result });

  } catch (err) {
    const s = err.status ?? 500;
    log("MATCHUPS ERRO", `${s} — ${err.message}`);
    return res.status(s).json({ error: "Erro ao analisar matchups.", detail: err.message });
  }
});

// =============================================================================
// ROTA 8: GET /api/quests/:riotId
//
// Gera 3 missões diárias baseadas nas fraquezas recentes do jogador.
// Requer que /api/player/:riotId tenha sido chamado antes (usa PLAYER_CACHE).
// =============================================================================

app.get("/api/quests/:riotId", async (req, res) => {
  const rawId = req.params.riotId;
  if (!rawId.includes("#"))
    return res.status(400).json({ error: "Formato inválido. Use Nome#TAG" });

  const [gameName, tagLine] = rawId.split("#");
  log("QUESTS REQUEST", rawId);

  try {
    const { puuid } = await riotGet(
      `https://${REGION_ACCOUNT}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
    );

    const playerData = cacheGet(PLAYER_CACHE, puuid);
    if (!playerData) {
      return res.status(404).json({
        error: "Jogador não encontrado no cache. Busque o perfil em /api/player/:riotId primeiro.",
      });
    }

    const result = generateDailyQuests(playerData.recentMatches ?? []);
    log("QUESTS OK", `${rawId} | quests=${result.quests.length} | basedOn=${result.basedOn} partidas`);
    return res.json({ riotId: rawId, ...result });

  } catch (err) {
    const s = err.status ?? 500;
    log("QUESTS ERRO", `${s} — ${err.message}`);
    return res.status(s).json({ error: "Erro ao gerar missões.", detail: err.message });
  }
});

// =============================================================================
// ROTA 9: GET /api/live/:riotId
//
// Retorna dados da partida ao vivo + Momentum Score.
// Cache inteligente: 180s para partida ativa, 60s para "não está em jogo".
// Query param ?simulate=true retorna dados simulados (para testes de UI).
// =============================================================================

app.get("/api/live/:riotId", async (req, res) => {
  const rawId    = req.params.riotId;
  const simulate = req.query.simulate === "true";

  if (simulate) {
    log("LIVE SIM", rawId);
    return res.json(getSimulatedGame());
  }

  if (!rawId.includes("#"))
    return res.status(400).json({ error: "Formato inválido. Use Nome#TAG" });

  const [gameName, tagLine] = rawId.split("#");
  log("LIVE REQUEST", rawId);

  try {
    const puuid = await resolvePuuid(gameName, tagLine);

    // Passa histórico do jogador se disponível (enriquece o Momentum Score)
    const playerData    = cacheGet(PLAYER_CACHE, puuid);
    const playerHistory = playerData ? {
      winrate: playerData.stats?.winrate,
      kda:     playerData.stats?.kda,
    } : null;

    const result       = await getLiveGame(puuid, REGION_PLATFORM, riotGet, playerHistory);
    const nextUpdateIn = Math.round(getDynamicInterval(result.gameLengthSec ?? 0) / 1000);
    log("LIVE OK", `${rawId} | isLive=${result.isLive} | fromCache=${result.fromCache} | score=${result.momentumScore ?? "N/A"} | nextPoll=${nextUpdateIn}s`);
    return res.json({ ...result, nextUpdateIn });

  } catch (err) {
    const s = err.status ?? 500;
    log("LIVE ERRO", `${s} — ${err.message}`);
    if (s === 404) return res.status(404).json({ error: "Jogador não encontrado." });
    return res.status(s).json({ error: "Erro ao buscar partida ao vivo.", detail: err.message });
  }
});

// =============================================================================
// ROTA 10: GET /api/war-room/:riotId
//
// War Room completo: identidade dos 10 jogadores (Nome#Tag), eventos inferidos
// por milestones de tempo, e counterplay baseado em composição.
// Query param ?simulate=true retorna partida simulada (T1 vs GEN).
//
// NOTA: Identity Resolver faz até 10 chamadas à account-v1 na PRIMEIRA vez.
// Após isso, o ROSTER_CACHE evita repetições durante toda a partida (~3h).
// =============================================================================

app.get("/api/war-room/:riotId", async (req, res) => {
  const rawId    = req.params.riotId;
  const simulate = req.query.simulate === "true";

  if (simulate) {
    log("WAR-ROOM SIM", rawId);
    return res.json(getSimulatedWarRoom());
  }

  if (!rawId.includes("#"))
    return res.status(400).json({ error: "Formato inválido. Use Nome#TAG" });

  const [gameName, tagLine] = rawId.split("#");
  log("WAR-ROOM REQUEST", rawId);

  try {
    const puuid = await resolvePuuid(gameName, tagLine);

    const result       = await getWarRoom(puuid, REGION_PLATFORM, riotGet, REGION_ACCOUNT);
    const nextUpdateIn = Math.round(getDynamicInterval(parseGameTimeSec(result.gameTime)) / 1000);
    log("WAR-ROOM OK", `${rawId} | gameTime=${result.gameTime} | events=${result.liveEvents.length} | tips=${result.counterStrategies.length} | nextPoll=${nextUpdateIn}s`);
    return res.json({ ...result, nextUpdateIn });

  } catch (err) {
    const s = err.status ?? 500;
    log("WAR-ROOM ERRO", `${s} — ${err.message}`);
    if (s === 404) {
      // Pode ser 404 de jogador não encontrado OU de não estar em jogo
      if (err.message === "NOT_FOUND") {
        return res.status(200).json({ isLive: false, reason: "Nenhuma partida ativa." });
      }
      return res.status(404).json({ error: "Jogador não encontrado." });
    }
    return res.status(s).json({ error: "Erro ao buscar War Room.", detail: err.message });
  }
});

// =============================================================================
// ROTA 11: POST /api/discord/test
//
// Valida uma URL de webhook e envia uma mensagem de teste com embed rico.
// Body: { webhookUrl: "https://discord.com/api/webhooks/..." }
// =============================================================================

app.post("/api/discord/test", async (req, res) => {
  const { webhookUrl } = req.body ?? {};

  if (!webhookUrl || !String(webhookUrl).match(/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//)) {
    return res.status(400).json({
      error: "URL de webhook inválida. Use a URL gerada pelo Discord (discord.com ou discordapp.com).",
    });
  }

  log("DISCORD TEST", webhookUrl.slice(0, 60) + "…");

  try {
    await sendTestAlert(webhookUrl);
    log("DISCORD TEST OK", "alerta de teste enviado");
    return res.json({ success: true, message: "Alerta de teste enviado! Verifique o canal do Discord." });
  } catch (err) {
    log("DISCORD TEST ERRO", err.message);
    return res.status(400).json({
      error: "Falha ao enviar para o Discord. Verifique se a URL do webhook está correta.",
      detail: err.message,
    });
  }
});

// =============================================================================
// ROTA 12: POST /api/discord/trigger/:riotId
//
// Busca dados da partida ao vivo e despacha alertas para o Discord.
// Usa GAME_CACHE interno (170s) — não duplica chamadas Spectator quando
// o frontend já buscou /api/war-room recentemente.
//
// Body: {
//   webhookUrl: "https://discord.com/api/webhooks/...",
//   prefs: { powerSpike, levelAlerts, objectives, counterplay }
// }
// =============================================================================

app.post("/api/discord/trigger/:riotId", async (req, res) => {
  const rawId = req.params.riotId;
  const { webhookUrl, prefs } = req.body ?? {};

  if (!rawId.includes("#"))
    return res.status(400).json({ error: "Formato inválido. Use Nome#TAG" });

  if (!webhookUrl || !String(webhookUrl).match(/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//)) {
    return res.status(400).json({ error: "webhookUrl inválida." });
  }

  const [gameName, tagLine] = rawId.split("#");
  log("DISCORD TRIGGER", rawId);

  try {
    const puuid = await resolvePuuid(gameName, tagLine);

    let warRoomData;
    try {
      warRoomData = await getWarRoom(puuid, REGION_PLATFORM, riotGet, REGION_ACCOUNT);
    } catch (err) {
      if (err.status === 404) {
        return res.json({ dispatched: 0, reason: "Jogador não está em partida." });
      }
      throw err;
    }

    const dispatched = dispatchWarRoomAlerts(warRoomData, webhookUrl, prefs, rawId);

    log("DISCORD TRIGGER OK", `${rawId} | dispatched=${dispatched} alertas`);
    return res.json({ dispatched, gameTime: warRoomData.gameTime });

  } catch (err) {
    const s = err.status ?? 500;
    log("DISCORD TRIGGER ERRO", `${s} — ${err.message}`);
    return res.status(s).json({ error: "Erro ao disparar alertas Discord.", detail: err.message });
  }
});

// =============================================================================
// ESTÁTICOS (produção) + HEALTH
// =============================================================================

app.get("/health", (_req, res) => res.json({
  status: "ok",
  cacheSize: {
    matches:   MATCH_CACHE.size,
    timelines: TIMELINE_CACHE.size,
    players:   PLAYER_CACHE.size,
    ai:        AI_CACHE.size,
    puuids:    PUUID_CACHE.size,
  },
  platform:   REGION_PLATFORM,
  aiEnabled:  !!process.env.GROQ_API_KEY,
  rateLimits: getRateLimitStatus(),
}));

if (process.env.NODE_ENV === "production") {
  // Em produção, o Dockerfile copia o build do frontend para /app/public
  const publicDir = path.resolve(__dirname, "../../public");
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
}

app.listen(PORT, "0.0.0.0", () => {
  const env = process.env.NODE_ENV ?? "development";
  console.log(`\n🚀 Atlas Server → http://0.0.0.0:${PORT}  [${env}]`);
  console.log(`   RIOT_API_KEY : ✅ ${RIOT_API_KEY.slice(0, 12)}…`);
  console.log(`   Cache        : ✅ match / timeline / player (TTL 15 min) | live (180s/60s)`);
  console.log(`   Plataforma   : ✅ ${REGION_PLATFORM} (override: RIOT_PLATFORM env var)`);
  console.log(`   Concorrência : ✅ 5 requests simultâneos por lote (20 partidas)\n`);
});
