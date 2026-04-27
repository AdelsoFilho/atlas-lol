import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
  Radio, RefreshCw, TrendingUp, TrendingDown,
  Minus, AlertTriangle, Tv2, FlaskConical,
} from "lucide-react";

// =============================================================================
// LiveMatchOverlay.jsx — War Room ao Vivo
//
// Detecta se o jogador está em partida e exibe:
//   · Gauge de Momentum Score (SVG arc, 0-100)
//   · Composição: Meu Time vs Inimigos
//   · Tendência (Rising / Stable / Collapsing)
//   · Alerta preditivo de composição
//   · Countdown até próxima verificação (180s)
//
// Smart polling:
//   · A cada 180s chama GET /api/live/:riotId
//   · Modo simulação (?simulate=true) para testar sem estar em jogo
//
// Props:
//   riotId {string} — "Nome#TAG"
// =============================================================================

const POLL_INTERVAL = 180_000; // 180s (espelha o cache do servidor)

// ── Gauge de Momentum (SVG meio-arco) ────────────────────────────────────────

function MomentumGauge({ score, trend }) {
  const R  = 54;
  const CX = 64, CY = 68;
  const sw = 10;
  const circ = Math.PI * R; // comprimento do semi-arco

  const fill  = Math.max(0, Math.min(1, score / 100)) * circ;
  const color = score >= 65 ? "#34d399" : score >= 40 ? "#60a5fa" : "#f87171";

  const arcPath = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  return (
    <div className="relative flex flex-col items-center">
      <svg width="128" height="76" viewBox="0 0 128 76" className="overflow-visible">
        {/* Track */}
        <path d={arcPath} fill="none" stroke="rgba(255,255,255,0.07)"
              strokeWidth={sw} strokeLinecap="round" />
        {/* Fill animado */}
        <path d={arcPath} fill="none" stroke={color}
              strokeWidth={sw} strokeLinecap="round"
              strokeDasharray={`${fill} ${circ}`}
              style={{ transition: "stroke-dasharray 0.9s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      {/* Valor central — posicionado sobre o arco */}
      <div className="absolute bottom-1 text-center pointer-events-none">
        <p className="text-3xl font-black leading-none" style={{ color }}>{score}</p>
        <p className="text-gray-600 text-[10px] mt-0.5 uppercase tracking-widest">momentum</p>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function LiveMatchOverlay({ riotId }) {
  const [phase,     setPhase]     = useState("idle");    // idle|loading|live|offline|error
  const [liveData,  setLiveData]  = useState(null);
  const [countdown, setCountdown] = useState(POLL_INTERVAL / 1000);
  const [simMode,   setSimMode]   = useState(false);

  const timerRef = useRef(null);
  const pollRef  = useRef(null);

  const fetchLive = useCallback(async (sim) => {
    if (!riotId) return;
    setPhase("loading");
    try {
      const url = `/api/live/${encodeURIComponent(riotId)}${sim ? "?simulate=true" : ""}`;
      const { data } = await axios.get(url);
      setLiveData(data);
      setPhase(data.isLive ? "live" : "offline");
    } catch {
      setPhase("error");
    }
    setCountdown(POLL_INTERVAL / 1000);
  }, [riotId]);

  // Inicia polling sempre que riotId ou simMode mudar
  useEffect(() => {
    if (!riotId) return;

    fetchLive(simMode);

    // Tick de countdown
    timerRef.current = setInterval(() => {
      setCountdown(c => Math.max(0, c - 1));
    }, 1000);

    // Re-poll a cada 180s
    pollRef.current = setInterval(() => {
      fetchLive(simMode);
    }, POLL_INTERVAL);

    return () => {
      clearInterval(timerRef.current);
      clearInterval(pollRef.current);
    };
  }, [riotId, simMode, fetchLive]);

  if (!riotId) return null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function fmtCd(s) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  const trend      = liveData?.trend ?? "Stable";
  const trendIcon  = trend === "Rising"
    ? <TrendingUp  size={12} className="text-emerald-400" />
    : trend === "Collapsing"
      ? <TrendingDown size={12} className="text-red-400" />
      : <Minus size={12} className="text-gray-500" />;
  const trendColor = trend === "Rising"
    ? "text-emerald-400"
    : trend === "Collapsing"
      ? "text-red-400"
      : "text-gray-500";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="card border border-white/8 bg-surface-800 space-y-4 relative overflow-hidden">

      {/* Badge simulado */}
      {liveData?.simulated && (
        <div className="absolute top-3 right-12">
          <span className="text-[10px] bg-purple-900/50 border border-purple-700/40
                           text-purple-300 px-2 py-0.5 rounded-full font-medium">
            simulado
          </span>
        </div>
      )}

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {phase === "live" ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
          ) : (
            <Radio size={13} className="text-gray-600" />
          )}
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
            {phase === "live" ? "Ao Vivo" : "War Room"}
          </p>
          {phase === "live" && liveData?.gameTime && (
            <span className="font-mono text-xs text-gray-500">{liveData.gameTime}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle simulação */}
          <button
            onClick={() => setSimMode(s => !s)}
            title={simMode ? "Desativar simulação" : "Testar com dados simulados"}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-all ${
              simMode
                ? "bg-purple-900/40 border-purple-700/40 text-purple-300"
                : "bg-surface-700 border-white/10 text-gray-600 hover:text-gray-400"
            }`}
          >
            <FlaskConical size={9} />
            {simMode ? "sim ON" : "sim"}
          </button>

          {/* Refresh + countdown */}
          <button
            onClick={() => fetchLive(simMode)}
            disabled={phase === "loading"}
            title="Atualizar agora"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300
                       transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={phase === "loading" ? "animate-spin" : ""} />
            <span className="font-mono">{fmtCd(countdown)}</span>
          </button>
        </div>
      </div>

      {/* ── Loading ────────────────────────────────────────────────────────── */}
      {phase === "loading" && (
        <div className="flex items-center justify-center gap-2 py-5 text-gray-500 text-sm">
          <RefreshCw size={14} className="animate-spin" />
          Verificando partida ao vivo…
        </div>
      )}

      {/* ── Offline ────────────────────────────────────────────────────────── */}
      {phase === "offline" && (
        <div className="text-center py-5 space-y-1.5">
          <p className="text-gray-500 text-sm">Nenhuma partida em andamento.</p>
          <p className="text-gray-700 text-xs">Próxima verificação em {fmtCd(countdown)}</p>
        </div>
      )}

      {/* ── Erro ──────────────────────────────────────────────────────────── */}
      {phase === "error" && (
        <div className="flex items-center gap-2 text-red-400 text-sm py-2">
          <AlertTriangle size={13} className="shrink-0" />
          Erro ao verificar partida. Tentando novamente em breve.
        </div>
      )}

      {/* ── AO VIVO ────────────────────────────────────────────────────────── */}
      {phase === "live" && liveData && (
        <>
          {/* Alerta preditivo */}
          {liveData.liveAlert && (
            <div className="flex items-start gap-2.5 bg-yellow-900/20 border border-yellow-700/30
                            rounded-xl px-3 py-2.5 text-yellow-200 text-xs leading-relaxed">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-yellow-400" />
              {liveData.liveAlert}
            </div>
          )}

          {/* Grade principal: time | gauge | inimigos */}
          <div className="grid grid-cols-[1fr_140px_1fr] items-center gap-3">
            {/* Meu time */}
            <div className="space-y-2 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Seu Time</p>
              <div className="flex flex-wrap gap-1">
                {liveData.teams?.mine?.champions?.map(c => (
                  <span key={c}
                    className="text-[11px] bg-blue-900/30 border border-blue-700/30
                               text-blue-300 px-1.5 py-0.5 rounded-md font-medium leading-none">
                    {c}
                  </span>
                ))}
              </div>
            </div>

            {/* Centro — gauge + tendência */}
            <div className="flex flex-col items-center gap-1">
              <MomentumGauge score={liveData.momentumScore} trend={liveData.trend} />
              <div className={`flex items-center gap-1 text-xs font-semibold ${trendColor}`}>
                {trendIcon}
                {trend}
              </div>
            </div>

            {/* Inimigos */}
            <div className="space-y-2 min-w-0 text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Inimigos</p>
              <div className="flex flex-wrap gap-1 justify-end">
                {liveData.teams?.enemy?.champions?.map(c => (
                  <span key={c}
                    className="text-[11px] bg-red-900/30 border border-red-700/30
                               text-red-300 px-1.5 py-0.5 rounded-md font-medium leading-none">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Rodapé: campeão + modo + spectate */}
          <div className="flex items-center justify-between text-xs text-gray-600 border-t border-white/5 pt-3">
            <div className="flex items-center gap-3">
              <span>
                ⚔️{" "}
                <span className="text-white font-semibold">{liveData.champion}</span>
              </span>
              <span className="text-gray-700">{liveData.gameMode}</span>
            </div>
            {liveData.encryptionKey && (
              <a
                href={`https://replay.leagueoflegends.com/REPLAY?gameId=${liveData.gameId}&platformId=${liveData.platformId}&encryptionKey=${liveData.encryptionKey}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Tv2 size={12} />Spectate
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
