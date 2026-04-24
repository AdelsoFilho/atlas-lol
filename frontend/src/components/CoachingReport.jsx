import { useState } from "react";
import axios from "axios";
import {
  Brain,
  AlertTriangle,
  TrendingDown,
  Zap,
  Target,
  Flame,
  Star,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Loader2,
  Users,
} from "lucide-react";

// =============================================================================
// CoachingReport.jsx — Relatório de Coaching Avançado
//
// Consome GET /api/coaching-report/:riotId e renderiza:
//   · Detecção de tilt (comparação com/sem First Blood)
//   · Risco de early game por campeão
//   · Até 3 insights acionáveis gerados pelo motor de regras
//
// Props:
//   riotId  {string}  — "GameName#TAG" do jogador
// =============================================================================

// ─── Configuração visual por severidade ──────────────────────────────────────

const SEV = {
  alta: {
    card:   "border-red-700/30 bg-red-900/10",
    badge:  "bg-red-900/50 text-red-300 border border-red-700/40",
    dot:    "bg-red-500",
    Icon:   AlertTriangle,
    color:  "text-red-400",
  },
  média: {
    card:   "border-yellow-700/30 bg-yellow-900/10",
    badge:  "bg-yellow-900/50 text-yellow-300 border border-yellow-700/40",
    dot:    "bg-yellow-500",
    Icon:   Zap,
    color:  "text-yellow-400",
  },
  baixa: {
    card:   "border-blue-700/30 bg-blue-900/10",
    badge:  "bg-blue-900/50 text-blue-300 border border-blue-700/40",
    dot:    "bg-blue-500",
    Icon:   Target,
    color:  "text-blue-400",
  },
  info: {
    card:   "border-white/5 bg-surface-700",
    badge:  "bg-surface-700 text-gray-400 border border-white/10",
    dot:    "bg-gray-500",
    Icon:   Star,
    color:  "text-gray-400",
  },
};

// ─── Sub-componente: linha de comparação (com FB vs sem FB) ──────────────────

function StatRow({ label, withFB, withoutFB, higherIsBetter = true, format = (v) => v }) {
  const better = higherIsBetter ? withFB >= withoutFB : withFB <= withoutFB;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-500 w-[4.5rem] shrink-0">{label}</span>
      <span className={`font-mono font-bold ${better ? "text-emerald-400" : "text-red-400"}`}>
        {format(withFB)}
      </span>
      <ChevronRight size={10} className="text-gray-700 shrink-0" />
      <span className={`font-mono font-bold ${better ? "text-red-400" : "text-emerald-400"}`}>
        {format(withoutFB)}
      </span>
    </div>
  );
}

// ─── Sub-componente: barra de progresso de risco ─────────────────────────────

function RiskBar({ rate }) {
  const color = rate >= 60 ? "bg-red-500" : "bg-yellow-500";
  return (
    <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${rate}%` }} />
    </div>
  );
}

// ─── Sub-componente: skeleton de carregamento ────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-16 card bg-surface-700" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-44 rounded-2xl bg-surface-700" />
        <div className="h-44 rounded-2xl bg-surface-700" />
      </div>
      <div className="h-52 rounded-2xl bg-surface-700" />
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CoachingReport({ riotId }) {
  const [phase,    setPhase]    = useState("idle"); // idle | loading | error | success
  const [data,     setData]     = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function fetchReport() {
    setPhase("loading");
    setErrorMsg("");
    try {
      const { data: res } = await axios.get(
        `/api/coaching-report/${encodeURIComponent(riotId)}`,
      );
      setData(res);
      setPhase("success");
    } catch (err) {
      const msg =
        err.response?.data?.error ??
        err.message ??
        "Erro ao gerar relatório de coaching.";
      setErrorMsg(msg);
      setPhase("error");
    }
  }

  // ── Estado: idle ─────────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div className="card flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-600/30
                          flex items-center justify-center shrink-0">
            <Brain size={16} className="text-purple-400" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Relatório de Coaching</p>
            <p className="text-gray-500 text-xs">Tilt · Early risk · Insights acionáveis</p>
          </div>
        </div>
        <button
          onClick={fetchReport}
          className="btn-primary flex items-center gap-2 text-sm shrink-0"
        >
          <Brain size={14} />Gerar Relatório
        </button>
      </div>
    );
  }

  // ── Estado: loading ───────────────────────────────────────────────────────
  if (phase === "loading") return <LoadingSkeleton />;

  // ── Estado: error ─────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="card space-y-3">
        <div className="flex items-start gap-3 bg-red-900/30 border border-red-700/50
                        rounded-xl px-4 py-3 text-red-300 text-sm">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
        <button
          onClick={fetchReport}
          className="flex items-center gap-2 text-gray-500 hover:text-white text-xs transition-colors"
        >
          <RefreshCw size={12} />Tentar novamente
        </button>
      </div>
    );
  }

  // ── Estado: success ───────────────────────────────────────────────────────
  const tilt     = data?.tiltAnalysis    ?? null;
  const early    = data?.earlyRiskAnalysis ?? null;
  const insights = data?.insights          ?? [];

  const hasTiltRisk   = tilt?.susceptibleToTilt  === true;
  const hasEarlyRisk  = (early?.riskyChampions?.length ?? 0) > 0;

  return (
    <div className="space-y-4">

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <div className="card flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-600/30
                          flex items-center justify-center shrink-0">
            <Brain size={16} className="text-purple-400" />
          </div>
          <div>
            <p className="text-white font-semibold">Relatório de Coaching</p>
            <p className="text-gray-500 text-xs">{riotId}</p>
          </div>
        </div>
        <button
          onClick={fetchReport}
          title="Atualizar"
          className="text-gray-600 hover:text-gray-400 transition-colors"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* ── Grid de cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Card — Tilt */}
        <div className={`card border space-y-4 ${
          tilt === null
            ? "border-white/5"
            : hasTiltRisk
              ? "border-red-700/30 bg-red-900/10"
              : "border-emerald-700/20 bg-emerald-900/10"
        }`}>
          <div className="flex items-center gap-2">
            <TrendingDown
              size={14}
              className={hasTiltRisk ? "text-red-400" : tilt !== null ? "text-emerald-400" : "text-gray-500"}
            />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Detecção de Tilt
            </p>
          </div>

          {/* Amostra insuficiente */}
          {tilt === null && (
            <p className="text-gray-500 text-sm leading-relaxed">
              Amostra insuficiente. São necessárias pelo menos 5 partidas com
              variação de First Blood para análise.
            </p>
          )}

          {/* Tilt detectado */}
          {tilt !== null && hasTiltRisk && (
            <>
              <p className="text-red-300 font-semibold text-sm">
                ⚠️ Padrão de Tilt Identificado
              </p>

              {/* Legenda colunas */}
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="w-[4.5rem] shrink-0" />
                <span className="text-emerald-400 font-semibold">Com FB</span>
                <ChevronRight size={10} className="text-gray-700 shrink-0" />
                <span className="text-red-400 font-semibold">Sem FB</span>
              </div>

              <div className="space-y-2.5">
                <StatRow
                  label="KDA"
                  withFB={tilt.firstBlood.avgKDA}
                  withoutFB={tilt.noFirstBlood.avgKDA}
                />
                <StatRow
                  label="CS/min"
                  withFB={tilt.firstBlood.avgCSPerMin}
                  withoutFB={tilt.noFirstBlood.avgCSPerMin}
                />
                <StatRow
                  label="Winrate"
                  withFB={tilt.firstBlood.winrate}
                  withoutFB={tilt.noFirstBlood.winrate}
                  format={(v) => `${v}%`}
                />
              </div>

              {/* Sequência de derrotas */}
              {tilt.maxLossStreak >= 3 && (
                <div className="flex items-center gap-2 bg-orange-900/30 border border-orange-700/30
                                rounded-xl px-3 py-2 text-orange-300 text-xs">
                  <Flame size={12} className="shrink-0" />
                  Maior sequência:{" "}
                  <span className="font-bold ml-1">{tilt.maxLossStreak} derrotas seguidas</span>
                </div>
              )}
            </>
          )}

          {/* Estável */}
          {tilt !== null && !hasTiltRisk && (
            <>
              <p className="text-emerald-400 font-semibold text-sm">
                ✅ Estabilidade Mental OK
              </p>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                  <span className="w-[4.5rem] shrink-0" />
                  <span className="text-emerald-400 font-semibold">Com FB</span>
                  <ChevronRight size={10} className="text-gray-700 shrink-0" />
                  <span className="text-gray-400 font-semibold">Sem FB</span>
                </div>
                <StatRow
                  label="KDA"
                  withFB={tilt.firstBlood.avgKDA}
                  withoutFB={tilt.noFirstBlood.avgKDA}
                />
                <StatRow
                  label="CS/min"
                  withFB={tilt.firstBlood.avgCSPerMin}
                  withoutFB={tilt.noFirstBlood.avgCSPerMin}
                />
              </div>
              {tilt.maxLossStreak >= 3 && (
                <div className="flex items-center gap-2 bg-orange-900/30 border border-orange-700/30
                                rounded-xl px-3 py-2 text-orange-300 text-xs">
                  <Flame size={12} className="shrink-0" />
                  Sequência de{" "}
                  <span className="font-bold mx-1">{tilt.maxLossStreak} derrotas</span>{" "}
                  detectada mesmo sem tilt psicológico.
                </div>
              )}
            </>
          )}
        </div>

        {/* Card — Early Game Risk */}
        <div className={`card border space-y-4 ${
          hasEarlyRisk ? "border-yellow-700/30 bg-yellow-900/10" : "border-white/5"
        }`}>
          <div className="flex items-center gap-2">
            <Zap size={14} className={hasEarlyRisk ? "text-yellow-400" : "text-gray-500"} />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Risco Early Game
            </p>
          </div>

          {!hasEarlyRisk ? (
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
              <CheckCircle2 size={14} />Early game controlado
            </div>
          ) : (
            <div className="space-y-4">
              {early.riskyChampions.map((champ) => {
                const isHigh = champ.earlyFeedRate >= 60;
                return (
                  <div key={champ.champion} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm font-semibold">{champ.champion}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                        isHigh
                          ? "text-red-300 bg-red-900/40 border-red-700/40"
                          : "text-yellow-300 bg-yellow-900/40 border-yellow-700/40"
                      }`}>
                        {champ.earlyFeedRate}% feed rate
                      </span>
                    </div>
                    <RiskBar rate={champ.earlyFeedRate} />
                    <p className="text-gray-600 text-xs">
                      {champ.earlyFeedCount}/{champ.games} partidas{" "}
                      <span className="text-gray-700">·</span>{" "}
                      WR {champ.winrate}%
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {early?.report && (
            <p className="text-gray-600 text-xs leading-relaxed border-t border-white/5 pt-3">
              {early.report}
            </p>
          )}
        </div>
      </div>

      {/* ── Plano de Coaching (Insights) ───────────────────────────────── */}
      {insights.length > 0 ? (
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <Target size={15} className="text-purple-400" />
            <h3 className="font-semibold text-white">Plano de Coaching</h3>
            <span className="ml-auto text-xs text-gray-600">
              {insights.length} insight{insights.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="space-y-3">
            {insights.map((insight, i) => {
              const cfg  = SEV[insight.severity] ?? SEV.info;
              const Icon = cfg.Icon;
              return (
                <div key={i} className={`rounded-2xl border px-4 py-4 flex gap-3 ${cfg.card}`}>
                  {/* Número */}
                  <span className="text-gray-600 font-bold text-sm shrink-0 mt-0.5 w-4">
                    {i + 1}
                  </span>

                  <div className="flex-1 space-y-2 min-w-0">
                    {/* Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Icon size={12} className={cfg.color} />
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${cfg.badge}`}>
                        {insight.severity}
                      </span>
                      <span className="text-xs text-gray-600 capitalize">
                        {insight.type.replace(/_/g, " ")}
                      </span>
                    </div>

                    {/* Texto */}
                    <p className="text-gray-200 text-sm leading-relaxed">
                      {insight.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Timestamp */}
          <p className="text-gray-700 text-xs text-right">
            Gerado às{" "}
            {new Date(data.generatedAt).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      ) : (
        <div className="card text-center py-8 text-gray-500 text-sm">
          Sem insights disponíveis — amostra de partidas insuficiente para análise.
        </div>
      )}
    </div>
  );
}
