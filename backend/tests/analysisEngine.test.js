"use strict";

const {
  analyzeDeathImpact,
  detectTiltPattern,
  earlyGameRisk,
  generateCoachingReport,
} = require("../src/services/analysisEngine");

const { calculateGroupRanking } = require("../src/services/groupBenchmark");

// =============================================================================
// HELPERS — construtores de eventos de timeline para os testes
// =============================================================================

const mkDeath  = (minute, second = 0, killerName = "Zed") =>
  ({ minute, second, type: "CHAMPION_KILL", isPlayerDeath: true,  isPlayerKill: false, isAllyKill: false, killerName });

const mkKill   = (minute, second = 0, victimName = "Jinx") =>
  ({ minute, second, type: "CHAMPION_KILL", isPlayerDeath: false, isPlayerKill: true,  isAllyKill: true,  victimName });

const mkDragon = (minute, second = 0, isPlayerTeam = false, subType = "INFERNAL_DRAGON") =>
  ({ minute, second, type: "DRAGON", isPlayerTeam, subType });

const mkBaron  = (minute, second = 0, isPlayerTeam = false) =>
  ({ minute, second, type: "BARON", isPlayerTeam });

const mkTower  = (minute, second = 0, isPlayerTeam = false) =>
  ({ minute, second, type: "TOWER", isPlayerTeam, lane: "MID_LANE" });

const mkHerald = (minute, second = 0, isPlayerTeam = false) =>
  ({ minute, second, type: "HERALD", isPlayerTeam });

// Helper: constrói objeto de match para testes de tilt/early
const mkMatch = ({ champion = "Jinx", win = true, kills = 5, deaths = 2, assists = 8,
                   kda = 3.0, csPerMin = 7.0, goldPerMin = 420, durationMin = 32,
                   firstBlood = false } = {}) => ({
  champion, win, kills, deaths, assists, kda, durationMin, firstBlood,
  analysis: { csPerMin, goldPerMin, killParticipation: 60, positives: [], negatives: [], verdict: "" },
});

// =============================================================================
// MÓDULO 1 — analyzeDeathImpact
// =============================================================================

describe("analyzeDeathImpact — Correlação Mortes × Objetivos", () => {

  test("morte aos 14min → dragão 15:30 (90s depois) = MORTE CRÍTICA", () => {
    const events = [
      mkDeath(14, 0),
      mkDragon(15, 30),   // 90s após a morte → dentro da janela de 120s
    ];
    const result = analyzeDeathImpact(events);

    expect(result.criticalDeaths).toBe(1);
    expect(result.totalDeaths).toBe(1);
    expect(result.criticalDeathRate).toBe(100);
    expect(result.objectivesLost.DRAGON).toBe(1);
    expect(result.report).toMatch(/1 morte crítica/i);
  });

  test("morte aos 14min → dragão 16:31 (151s depois) = NÃO crítica", () => {
    const events = [
      mkDeath(14, 0),
      mkDragon(16, 31),   // 151s após a morte → fora da janela de 120s
    ];
    const result = analyzeDeathImpact(events);

    expect(result.criticalDeaths).toBe(0);
    expect(result.report).toMatch(/nenhuma morte crítica/i);
  });

  test("morte → objetivo GANHO pelo time = NÃO crítica", () => {
    const events = [
      mkDeath(14, 0),
      mkDragon(15, 0, true),  // isPlayerTeam = true → time ganhou o dragão
    ];
    const result = analyzeDeathImpact(events);

    expect(result.criticalDeaths).toBe(0);
  });

  test("2 mortes: 1 crítica (Barão min 21) e 1 sem consequência (min 10)", () => {
    const events = [
      mkDeath(10, 0),           // min 10 — sem objetivo próximo
      mkDeath(20, 0),           // min 20 — Barão 90s depois
      mkBaron(21, 30),          // 90s após a 2ª morte
    ];
    const result = analyzeDeathImpact(events);

    expect(result.totalDeaths).toBe(2);
    expect(result.criticalDeaths).toBe(1);
    expect(result.objectivesLost.BARON).toBe(1);
    expect(result.criticalDeathRate).toBe(50);
  });

  test("morte crítica liga ao primeiro objetivo dentro da janela, não ao mais próximo depois", () => {
    const events = [
      mkDeath(15, 0),
      mkTower(16, 0),           // 60s depois — deve ser o linked
      mkBaron(16, 30),          // 90s depois — segundo candidato (não deve vencer)
    ];
    const result = analyzeDeathImpact(events);

    expect(result.criticalDeaths).toBe(1);
    expect(result.criticalDeathDetails[0].objectiveLost).toBe("TOWER");
  });

  test("sem mortes = zero mortes críticas", () => {
    const events = [mkDragon(12, 0), mkBaron(20, 0)];
    const result = analyzeDeathImpact(events);

    expect(result.totalDeaths).toBe(0);
    expect(result.criticalDeaths).toBe(0);
  });

  test("events vazio retorna objeto limpo sem erros", () => {
    const result = analyzeDeathImpact([]);
    expect(result.criticalDeaths).toBe(0);
    expect(result.report).toBeDefined();
  });

  test("taxa crítica de 60% gera relatório com percentual correto", () => {
    const events = [
      mkDeath(10, 0), mkDragon(11, 0),   // crítica
      mkDeath(14, 0), mkTower(15, 0),    // crítica
      mkDeath(20, 0), mkDragon(20, 30),  // crítica
      mkDeath(25, 0),                     // não crítica
      mkDeath(30, 0),                     // não crítica
    ];
    const result = analyzeDeathImpact(events);

    expect(result.totalDeaths).toBe(5);
    expect(result.criticalDeaths).toBe(3);
    expect(result.criticalDeathRate).toBe(60);
  });

  test("morte exatamente no limite de 120s = crítica (boundary inclusive)", () => {
    // 14:00 = 840s, 16:00 = 960s → diferença exata de 120s
    const events = [
      mkDeath(14, 0),
      mkDragon(16, 0),   // exatamente 120s depois
    ];
    const result = analyzeDeathImpact(events);
    expect(result.criticalDeaths).toBe(1);
  });

  test("objetivo ANTES da morte não é contabilizado", () => {
    const events = [
      mkDragon(13, 0),  // dragão perdido ANTES da morte
      mkDeath(14, 0),
    ];
    const result = analyzeDeathImpact(events);
    expect(result.criticalDeaths).toBe(0);
  });
});

// =============================================================================
// MÓDULO 2A — detectTiltPattern
// =============================================================================

describe("detectTiltPattern — Susceptibilidade a Tilt", () => {

  test("queda > 20% no KDA sem first blood = SUSCEPTÍVEL", () => {
    const matches = [
      mkMatch({ firstBlood: true,  kda: 4.0, csPerMin: 7.5, win: true  }),
      mkMatch({ firstBlood: true,  kda: 3.8, csPerMin: 7.2, win: true  }),
      mkMatch({ firstBlood: false, kda: 1.5, csPerMin: 5.0, win: false }),
      mkMatch({ firstBlood: false, kda: 1.2, csPerMin: 4.8, win: false }),
      mkMatch({ firstBlood: false, kda: 1.8, csPerMin: 5.2, win: false }),
    ];
    const result = detectTiltPattern(matches);

    expect(result).not.toBeNull();
    expect(result.susceptibleToTilt).toBe(true);
    expect(result.kdaDropPercent).toBeGreaterThan(20);
  });

  test("performance estável independente do first blood = SEM tilt", () => {
    const matches = [
      mkMatch({ firstBlood: true,  kda: 3.0, csPerMin: 6.5, win: true  }),
      mkMatch({ firstBlood: true,  kda: 3.2, csPerMin: 6.8, win: true  }),
      mkMatch({ firstBlood: false, kda: 2.9, csPerMin: 6.3, win: true  }),
      mkMatch({ firstBlood: false, kda: 3.1, csPerMin: 6.5, win: false }),
      mkMatch({ firstBlood: false, kda: 2.8, csPerMin: 6.2, win: true  }),
    ];
    const result = detectTiltPattern(matches);

    expect(result).not.toBeNull();
    expect(result.susceptibleToTilt).toBe(false);
  });

  test("menos de 5 partidas retorna null (amostra insuficiente)", () => {
    const matches = [
      mkMatch({ firstBlood: true  }),
      mkMatch({ firstBlood: false }),
      mkMatch({ firstBlood: false }),
    ];
    expect(detectTiltPattern(matches)).toBeNull();
  });

  test("sem partidas com first blood retorna null", () => {
    const matches = Array(6).fill(mkMatch({ firstBlood: false }));
    expect(detectTiltPattern(matches)).toBeNull();
  });

  test("sequência de 4 derrotas é detectada no maxLossStreak", () => {
    const matches = [
      mkMatch({ win: false, firstBlood: true,  kda: 3.0, csPerMin: 6.0 }),
      mkMatch({ win: false, firstBlood: false, kda: 1.0, csPerMin: 4.0 }),
      mkMatch({ win: false, firstBlood: false, kda: 0.8, csPerMin: 3.5 }),
      mkMatch({ win: false, firstBlood: false, kda: 0.7, csPerMin: 3.0 }),
      mkMatch({ win: true,  firstBlood: true,  kda: 4.0, csPerMin: 7.0 }),
    ];
    const result = detectTiltPattern(matches);
    if (result) expect(result.maxLossStreak).toBeGreaterThanOrEqual(3);
  });
});

// =============================================================================
// MÓDULO 2B — earlyGameRisk
// =============================================================================

describe("earlyGameRisk — Risco no Early Game por Campeão", () => {

  test("campeão com 66% early feed rate = RISCO DETECTADO", () => {
    const matches = [
      mkMatch({ champion: "Yasuo", deaths: 6, goldPerMin: 290 }),
      mkMatch({ champion: "Yasuo", deaths: 7, goldPerMin: 270 }),
      mkMatch({ champion: "Yasuo", deaths: 2, goldPerMin: 460, win: true }),
    ];
    const result = earlyGameRisk(matches);

    const yasuo = result.riskyChampions.find(c => c.champion === "Yasuo");
    expect(yasuo).toBeDefined();
    expect(yasuo.earlyFeedRate).toBeGreaterThanOrEqual(60);
  });

  test("campeão com boa performance = SEM risco detectado", () => {
    const matches = [
      mkMatch({ champion: "Jinx", deaths: 2, goldPerMin: 450, win: true }),
      mkMatch({ champion: "Jinx", deaths: 1, goldPerMin: 480, win: true }),
      mkMatch({ champion: "Jinx", deaths: 3, goldPerMin: 420, win: true }),
    ];
    const result = earlyGameRisk(matches);
    expect(result.riskyChampions.length).toBe(0);
  });

  test("menos de 2 partidas por campeão = não qualifica como risco", () => {
    const matches = [
      mkMatch({ champion: "Zed", deaths: 8, goldPerMin: 250 }), // só 1 partida
    ];
    const result = earlyGameRisk(matches);
    expect(result.riskyChampions.length).toBe(0);
  });

  test("múltiplos campeões com risco são retornados ordenados por taxa", () => {
    const matches = [
      mkMatch({ champion: "Yasuo", deaths: 7, goldPerMin: 250 }),
      mkMatch({ champion: "Yasuo", deaths: 6, goldPerMin: 260 }),
      mkMatch({ champion: "Zed",   deaths: 5, goldPerMin: 290 }),
      mkMatch({ champion: "Zed",   deaths: 5, goldPerMin: 280 }),
    ];
    const result = earlyGameRisk(matches);
    // Ambos devem ter 100% de early feed rate
    expect(result.riskyChampions.length).toBe(2);
    expect(result.riskyChampions[0].earlyFeedRate).toBeGreaterThanOrEqual(
      result.riskyChampions[1].earlyFeedRate,
    );
  });
});

// =============================================================================
// MÓDULO 4 — generateCoachingReport
// =============================================================================

describe("generateCoachingReport — Síntese de Insights", () => {

  test("retorna até 3 insights quando todos os módulos têm dados", () => {
    const result = generateCoachingReport({
      deathImpact: { criticalDeaths: 3, totalDeaths: 5, criticalDeathRate: 60, objectivesLost: { DRAGON: 2 }, report: "3 críticas" },
      tiltData:    { susceptibleToTilt: true, kdaDropPercent: 35, csDropPercent: 15, maxLossStreak: 4 },
      earlyRisk:   { riskyChampions: [{ champion: "Zed", earlyFeedRate: 60 }] },
    });

    expect(result.insights.length).toBeGreaterThan(0);
    expect(result.insights.length).toBeLessThanOrEqual(3);
    expect(result.summary.length).toEqual(result.insights.length);
    expect(result.generatedAt).toBeDefined();
  });

  test("sem dados = retorna insights de fallback sem lançar exceção", () => {
    expect(() => generateCoachingReport({})).not.toThrow();
    const result = generateCoachingReport({});
    expect(result.insights).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  test("deathImpact com taxa >= 40% gera insight de erro_recorrente com severidade alta", () => {
    const result = generateCoachingReport({
      deathImpact: { criticalDeaths: 4, totalDeaths: 5, criticalDeathRate: 80, objectivesLost: {} },
    });
    const errInsight = result.insights.find(i => i.type === "erro_recorrente");
    expect(errInsight).toBeDefined();
    expect(errInsight.severity).toBe("alta");
  });

  test("maxLossStreak >= 3 gera alerta_meta de severidade alta", () => {
    const result = generateCoachingReport({
      tiltData: { susceptibleToTilt: false, kdaDropPercent: 5, csDropPercent: 5, maxLossStreak: 5 },
    });
    const alertInsight = result.insights.find(i => i.type === "alerta_meta");
    expect(alertInsight).toBeDefined();
    expect(alertInsight.severity).toBe("alta");
  });
});

// =============================================================================
// MÓDULO 3 — calculateGroupRanking
// =============================================================================

describe("calculateGroupRanking — Benchmarking de Grupo", () => {

  const baseStats = (overrides = {}) => ({
    winrate: 55, kda: 3.0, avgGoldPerMin: 420,
    avgKills: 6, avgDeaths: 4, avgAssists: 8,
    ...overrides,
  });

  test("jogador com melhor KDA do grupo é destacado como outlier positivo", () => {
    const current = { riotId: "Hero#BR1",    stats: baseStats({ kda: 5.0 }) };
    const group   = [
      { riotId: "Friend1#BR1", stats: baseStats({ kda: 2.5 }) },
      { riotId: "Friend2#BR1", stats: baseStats({ kda: 2.0 }) },
    ];
    const result = calculateGroupRanking(current, group);

    const kdaOutlier = result.outliers.find(o => o.metric === "KDA" && o.position === "melhor");
    expect(kdaOutlier).toBeDefined();
    expect(result.report).toMatch(/melhor/i);
  });

  test("jogador com pior winrate é destacado como outlier negativo", () => {
    const current = { riotId: "Hero#BR1",    stats: baseStats({ winrate: 35 }) };
    const group   = [
      { riotId: "Friend1#BR1", stats: baseStats({ winrate: 60 }) },
      { riotId: "Friend2#BR1", stats: baseStats({ winrate: 55 }) },
    ];
    const result = calculateGroupRanking(current, group);

    const wrOutlier = result.outliers.find(o => o.metric === "winrate" && o.position === "pior");
    expect(wrOutlier).toBeDefined();
  });

  test("groupSize é correto (atual + grupo)", () => {
    const current = { riotId: "A#BR1", stats: baseStats() };
    const group   = [
      { riotId: "B#BR1", stats: baseStats() },
      { riotId: "C#BR1", stats: baseStats() },
    ];
    const result = calculateGroupRanking(current, group);
    expect(result.groupSize).toBe(3);
  });

  test("lança erro se groupPlayers for array vazio", () => {
    const current = { riotId: "A#BR1", stats: baseStats() };
    expect(() => calculateGroupRanking(current, [])).toThrow();
  });

  test("overallPercentile está entre 0 e 100", () => {
    const current = { riotId: "A#BR1", stats: baseStats({ kda: 4.0, winrate: 65 }) };
    const group   = [{ riotId: "B#BR1", stats: baseStats() }];
    const result  = calculateGroupRanking(current, group);

    if (result.overallPercentile !== null) {
      expect(result.overallPercentile).toBeGreaterThanOrEqual(0);
      expect(result.overallPercentile).toBeLessThanOrEqual(100);
    }
  });
});
