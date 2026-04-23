import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import {
  X, Users, Activity, Loader2, AlertCircle, Clock,
  ThumbsUp, ThumbsDown, Swords,
} from "lucide-react";
import GoldChart from "./GoldChart";
import TimelineViewer from "./TimelineViewer";
import MatchupGrid from "./MatchupGrid";

// ─── MatchDetail ──────────────────────────────────────────────────────────────
// Modal com duas abas:
//   "Adversários" → MatchupGrid (dados já disponíveis no match)
//   "Timeline"    → lazy-fetch /api/timeline/:matchId?puuid=xxx
//                   → GoldChart + TimelineViewer
//
// Renderizado via React Portal para evitar problemas de z-index/overflow.
// ─────────────────────────────────────────────────────────────────────────────

function kdaColor(k) {
  if (k >= 4)   return "text-emerald-400";
  if (k >= 2.5) return "text-blue-400";
  if (k >= 1.5) return "text-yellow-400";
  return "text-red-400";
}

export default function MatchDetail({ match, puuid, onClose }) {
  const [tab, setTab]         = useState("adversarios");
  const [timeline, setTimeline] = useState(null);
  const [tlLoading, setTlLoading] = useState(false);
  const [tlError, setTlError]   = useState(null);

  // Busca timeline apenas quando o usuário clica na aba
  const fetchTimeline = useCallback(async () => {
    if (timeline || tlLoading) return;
    setTlLoading(true);
    setTlError(null);
    try {
      const { data } = await axios.get(
        `/api/timeline/${match.matchId}?puuid=${encodeURIComponent(puuid)}`
      );
      setTimeline(data);
    } catch (err) {
      const msg = err.response?.data?.error ?? err.message ?? "Erro ao carregar timeline.";
      setTlError(msg);
    } finally {
      setTlLoading(false);
    }
  }, [match.matchId, puuid, timeline, tlLoading]);

  // Fecha com Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Bloqueia scroll do body enquanto modal está aberto
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleTabChange = (t) => {
    setTab(t);
    if (t === "timeline") fetchTimeline();
  };

  const { champion, win, kills, deaths, assists, kda, durationMin, analysis } = match;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-6 px-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Painel */}
      <div
        className="relative z-10 w-full max-w-3xl bg-surface-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ──────────────────────────────────────────── */}
        <div className={`flex items-center gap-4 px-5 py-4 border-b border-white/5
          ${win ? "bg-emerald-950/30" : "bg-red-950/20"}`}
        >
          {/* Campeão */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base shrink-0
            ${win
              ? "bg-emerald-800/40 text-emerald-200 border border-emerald-700/40"
              : "bg-red-800/30 text-red-200 border border-red-700/30"
            }`}
          >
            {champion.slice(0, 2).toUpperCase()}
          </div>

          <div className="min-w-0">
            <p className="font-bold text-white leading-tight">
              {champion}
              <span className={`ml-2 text-sm font-semibold ${win ? "text-emerald-400" : "text-red-400"}`}>
                {win ? "Vitória" : "Derrota"}
              </span>
            </p>
            <div className="flex items-center gap-3 mt-0.5">
              <span className={`text-sm font-bold ${kdaColor(kda)}`}>
                {kills}/{deaths}/{assists}
              </span>
              <span className="text-gray-600 text-xs flex items-center gap-1">
                <Clock size={10} />{durationMin}m
              </span>
              {analysis && (
                <>
                  <span className="text-gray-600 text-xs">{analysis.csPerMin} cs/min</span>
                  <span className="text-gray-600 text-xs">{analysis.goldPerMin} g/min</span>
                </>
              )}
            </div>
          </div>

          {/* Botão fechar */}
          <button
            onClick={onClose}
            className="ml-auto p-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Quick stats (positivos / negativos) ─────────────── */}
        {analysis && (analysis.positives.length > 0 || analysis.negatives.length > 0) && (
          <div className="grid grid-cols-2 gap-px bg-white/5 border-b border-white/5">
            <div className="bg-surface-800 px-4 py-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 flex items-center gap-1">
                <ThumbsUp size={10} />O que funcionou
              </p>
              {analysis.positives.slice(0, 2).map((p, i) => (
                <p key={i} className="text-xs text-emerald-300 leading-snug">✓ {p}</p>
              ))}
              {analysis.positives.length === 0 && (
                <p className="text-xs text-gray-700 italic">—</p>
              )}
            </div>
            <div className="bg-surface-800 px-4 py-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 flex items-center gap-1">
                <ThumbsDown size={10} />O que falhou
              </p>
              {analysis.negatives.slice(0, 2).map((n, i) => (
                <p key={i} className="text-xs text-red-300 leading-snug">✗ {n}</p>
              ))}
              {analysis.negatives.length === 0 && (
                <p className="text-xs text-gray-700 italic">—</p>
              )}
            </div>
          </div>
        )}

        {/* ── Abas ─────────────────────────────────────────────── */}
        <div className="flex border-b border-white/5">
          <TabButton
            active={tab === "adversarios"}
            onClick={() => handleTabChange("adversarios")}
            icon={<Users size={13} />}
            label="Adversários"
          />
          <TabButton
            active={tab === "timeline"}
            onClick={() => handleTabChange("timeline")}
            icon={<Activity size={13} />}
            label="Timeline"
          />
        </div>

        {/* ── Conteúdo das abas ────────────────────────────────── */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">

          {/* Aba Adversários */}
          {tab === "adversarios" && (
            <MatchupGrid participants={match.participants} />
          )}

          {/* Aba Timeline */}
          {tab === "timeline" && (
            <div className="space-y-6">
              {tlLoading && (
                <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-sm">
                  <Loader2 size={16} className="animate-spin" />
                  Carregando timeline…
                </div>
              )}

              {tlError && (
                <div className="flex items-start gap-2 bg-red-900/20 border border-red-700/30
                                rounded-xl px-4 py-3 text-red-300 text-sm">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  {tlError}
                </div>
              )}

              {!tlLoading && !tlError && !timeline && (
                <div className="flex items-center justify-center gap-2 py-8 text-gray-600 text-sm">
                  <Swords size={14} />Carregando dados…
                </div>
              )}

              {timeline && (
                <>
                  {/* Gráfico de Gold Diff */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                      Diferença de Ouro por Minuto
                    </h3>
                    <div className="bg-surface-700 border border-white/5 rounded-xl p-4">
                      <GoldChart
                        goldDiffs={timeline.goldDiffs}
                        tippingPoint={timeline.tippingPoint}
                        gameDurationMin={timeline.gameDurationMin}
                      />
                    </div>
                  </section>

                  {/* Timeline de eventos */}
                  <section className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                      Eventos da Partida
                    </h3>
                    <TimelineViewer
                      events={timeline.events}
                      tippingPoint={timeline.tippingPoint}
                      gameDurationMin={timeline.gameDurationMin}
                    />
                  </section>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors
        ${active
          ? "border-blue-500 text-blue-300"
          : "border-transparent text-gray-500 hover:text-gray-300"
        }`}
    >
      {icon}{label}
    </button>
  );
}
