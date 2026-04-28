import { useState, useEffect } from "react";

// =============================================================================
// useGameClock.js — Relógio de Jogo com Projeção Client-Side
//
// Como a Riot API tem latência (agora ~45-90s com smart polling), a UI
// não pode mostrar um relógio parado. Este hook:
//
//   1. Avança o tempo de jogo 1 segundo a cada segundo real
//   2. Estima o ouro acumulado com base numa curva de income passiva (sem
//      considerar kills/farm — claramente marcado como "~estimado")
//   3. Calcula o estado de freshness dos dados:
//      🟢 live      — recebido há < 15s
//      🟡 projected — projetado, 15s até próximo poll
//      🟠 syncing   — aguardando próximo fetch da API
//
// HONESTIDADE TÉCNICA:
//   · A curva de gold é uma ESTIMATIVA baseada no income passivo médio de Lane.
//     Kills, CS, bounties e itens são ignorados — a projeção pode errar em ±20%.
//   · O relógio de jogo é preciso porque o servidor retorna o gameLength em
//     segundos e a diferença de tempo desde o fetch é mensurável no client.
//
// Uso:
//   const { projectedSec, projectedGold, freshness, elapsed } =
//     useGameClock(apiGameSec, apiReceivedAt, nextUpdateIn);
//
//   fmtTime(projectedSec) → "14:32"
// =============================================================================

// ── Curva de income passivo médio (g/s, valores do Wiki do LoL) ──────────────
// Assume lane player sem kills e com CS médio.
// Estes valores representam o income total estimado (passivo + minions médios).
const GOLD_PHASES = [
  { until: 90,       rate: 2.1  }, // 0-1.5min: ouro inicial + primeiros minions
  { until: 300,      rate: 3.2  }, // 1.5-5min: phase early com CS
  { until: 900,      rate: 4.8  }, // 5-15min: lane phase plena
  { until: 1800,     rate: 6.5  }, // 15-30min: mid + rotações
  { until: Infinity, rate: 8.0  }, // 30+min: late game escalado
];

export function estimateGoldAt(gameTimeSec) {
  if (!gameTimeSec || gameTimeSec <= 0) return 500;
  let gold = 500; // ouro inicial
  let t = 0;
  for (const phase of GOLD_PHASES) {
    const duration = Math.min(gameTimeSec - t, phase.until - t);
    if (duration <= 0) break;
    gold += duration * phase.rate;
    t += duration;
    if (t >= gameTimeSec) break;
  }
  return Math.round(gold);
}

// ── Formatação MM:SS ──────────────────────────────────────────────────────────
export function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec ?? 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

// ── Hook principal ────────────────────────────────────────────────────────────
/**
 * @param {number|null} apiGameSec     — tempo de jogo no momento do fetch
 * @param {number|null} apiReceivedAt  — Date.now() quando o dado chegou
 * @param {number}      nextUpdateIn   — segundos até próximo poll (padrão 60)
 * @returns {{ projectedSec, projectedGold, freshness, elapsed }}
 */
export function useGameClock(apiGameSec, apiReceivedAt, nextUpdateIn = 60) {
  const [state, setState] = useState(() => ({
    projectedSec:  apiGameSec  ?? 0,
    projectedGold: estimateGoldAt(apiGameSec ?? 0),
    elapsed:       0,
    freshness:     "live",
  }));

  useEffect(() => {
    if (apiGameSec == null || !apiReceivedAt) return;

    const tick = setInterval(() => {
      const elapsedSec = (Date.now() - apiReceivedAt) / 1000;
      const projSec    = Math.round(apiGameSec + elapsedSec);

      // Freshness: baseado no tempo decorrido vs próximo poll agendado
      let freshness;
      if      (elapsedSec < 15)                    freshness = "live";
      else if (elapsedSec < (nextUpdateIn - 10))   freshness = "projected";
      else                                          freshness = "syncing";

      setState({
        projectedSec:  projSec,
        projectedGold: estimateGoldAt(projSec),
        elapsed:       Math.floor(elapsedSec),
        freshness,
      });
    }, 1000);

    return () => clearInterval(tick);
  }, [apiGameSec, apiReceivedAt, nextUpdateIn]);

  return state;
}

// ── Labels e cores de freshness ───────────────────────────────────────────────
export const FRESHNESS_CONFIG = {
  live:      { label: "Ao Vivo",       dot: "bg-green-500",  text: "text-green-400"  },
  projected: { label: "Projetado",     dot: "bg-yellow-500", text: "text-yellow-400" },
  syncing:   { label: "Sincronizando", dot: "bg-orange-500", text: "text-orange-400" },
};
