"use strict";

// =============================================================================
// smartPoller.js — Motor de Polling Adaptativo
//
// Lê os headers de rate limit de TODA resposta da Riot API e calcula o
// próximo intervalo seguro de polling dinamicamente.
//
// FATOS TÉCNICOS IMPORTANTES:
//   · Personal Key: 20 req/s, 100 req/2min
//   · Spectator V5 snapshot atualiza a cada ~30s no lado da Riot
//   · Polling mais rápido que 30s retorna os MESMOS dados (desperdiça quota)
//   · Intervalo mínimo seguro: 45s early game
//   · Intervalo mínimo absoluto: 30s (nunca abaixo)
//
// Algoritmo:
//   1. Fase do jogo (early/mid/late) define o intervalo base
//   2. Taxa de uso do rate limit (0-100%) define um multiplicador
//   3. Se >= 85% de uso → dobra o intervalo (modo de emergência)
//   4. Se <= 15% de uso → pode acelerar levemente
// =============================================================================

// ── Estado global de rate limit (atualizado a cada resposta da Riot) ─────────
const RL = {
  appLimits:  [],  // [{value: 20, window: 1}, {value: 100, window: 120}]
  appCounts:  [],  // contagens atuais nos mesmos índices
  updatedAt:  0,
};

// ── Parser de header "20:1,100:120" ──────────────────────────────────────────
function parseRLHeader(header) {
  if (!header) return [];
  return header.split(",")
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      const [v, w] = p.split(":");
      return { value: parseInt(v, 10) || 0, window: parseInt(w, 10) || 1 };
    });
}

// ── Atualiza o estado a partir dos headers HTTP da resposta ──────────────────
function updateFromHeaders(headers) {
  if (!headers) return;
  const lmt = headers["x-app-rate-limit"];
  const cnt = headers["x-app-rate-limit-count"];
  if (lmt) RL.appLimits = parseRLHeader(lmt);
  if (cnt) RL.appCounts = parseRLHeader(cnt);
  RL.updatedAt = Date.now();
}

// ── Percentual de uso do rate limit (0.0 – 1.0) ──────────────────────────────
// Usa o pior caso (janela mais restritiva).
function getUsagePct() {
  if (!RL.appLimits.length || !RL.appCounts.length) return 0.05;
  const n = Math.min(RL.appLimits.length, RL.appCounts.length);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const lim = RL.appLimits[i].value;
    const cnt = RL.appCounts[i].value;
    if (lim > 0) max = Math.max(max, cnt / lim);
  }
  return max;
}

// ── Intervalo dinâmico em milissegundos ───────────────────────────────────────
/**
 * Retorna o próximo intervalo de polling recomendado em ms.
 *
 * @param {number} gameTimeSec  — tempo de jogo atual em segundos
 * @returns {number}            — intervalo em ms (mínimo 30s, padrão 45-90s)
 */
function getDynamicInterval(gameTimeSec) {
  const usagePct = getUsagePct();

  // Base por fase de jogo
  let baseSec;
  if      (gameTimeSec < 900)  baseSec = 45; // 0-15min: early — ações frequentes
  else if (gameTimeSec < 1800) baseSec = 60; // 15-30min: mid — rotas de objetivo
  else                          baseSec = 90; // 30+min: late — menos dinâmico

  // Multiplicador por uso do rate limit
  let mult;
  if      (usagePct >= 0.85) mult = 2.5;   // 85%+ → danger zone
  else if (usagePct >= 0.70) mult = 1.7;   // 70-85% → warning
  else if (usagePct >= 0.50) mult = 1.25;  // 50-70% → moderado
  else if (usagePct <= 0.15) mult = 0.90;  // <15% → espaço livre, leve aceleração
  else                        mult = 1.0;   // 15-50% → normal

  // Mínimo absoluto de 30s (Spectator não atualiza mais rápido que isso)
  const finalSec = Math.max(30, Math.round(baseSec * mult));

  const phase = gameTimeSec < 900 ? "early" : gameTimeSec < 1800 ? "mid" : "late";
  console.log(
    `[smartPoller] interval=${finalSec}s` +
    ` | phase=${phase} (${Math.floor(gameTimeSec / 60)}min)` +
    ` | rlUsage=${(usagePct * 100).toFixed(0)}%` +
    ` | base=${baseSec}s × ${mult}`
  );

  return finalSec * 1000;
}

// ── Status público (para /health e debugging) ─────────────────────────────────
function getRateLimitStatus() {
  return {
    usagePct:   Math.round(getUsagePct() * 100),
    appLimits:  RL.appLimits,
    appCounts:  RL.appCounts,
    ageMs:      RL.updatedAt ? Date.now() - RL.updatedAt : null,
    isStale:    RL.updatedAt === 0 || Date.now() - RL.updatedAt > 300_000,
  };
}

module.exports = { updateFromHeaders, getDynamicInterval, getRateLimitStatus };
