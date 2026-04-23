import { useState } from "react";
import {
  ChevronDown, ChevronUp, Clock, ThumbsUp, ThumbsDown,
  TriangleAlert, ExternalLink,
} from "lucide-react";
import FullMatchAnalysis from "./FullMatchAnalysis";

// ─── MatchList ────────────────────────────────────────────────────────────────
// Lista de partidas com paginação ("Ver mais 5").
// Cada linha tem um MatchCard compacto + botão "Análise Completa".
// O botão abre o MatchDetail (modal) para a partida selecionada.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 5;

function kdaColor(k) {
  if (k >= 4)   return "text-emerald-400";
  if (k >= 2.5) return "text-blue-400";
  if (k >= 1.5) return "text-yellow-400";
  return "text-red-400";
}

// ── MatchCard inline ─────────────────────────────────────────────────────────
function MatchCard({ match, index, onOpenDetail }) {
  const [expanded, setExpanded] = useState(false);
  const { analysis, isAnomaly, win } = match;

  const borderColor = win
    ? "border-emerald-700/50 bg-emerald-950/20"
    : "border-red-800/40 bg-red-950/20";

  const hasPositives = analysis.positives.length > 0;
  const hasNegatives = analysis.negatives.length > 0;

  return (
    <div className={`rounded-2xl border ${borderColor} overflow-hidden`}>

      {/* Header sempre visível */}
      <div className="flex items-center gap-2 px-4 py-3">

        {/* Índice */}
        <span className="text-gray-600 text-xs w-4 shrink-0 text-right">{index + 1}</span>

        {/* V / D */}
        <span className={`text-xs font-bold w-5 shrink-0 ${win ? "text-emerald-400" : "text-red-400"}`}>
          {win ? "V" : "D"}
        </span>

        {/* Badge anomalia */}
        {isAnomaly && (
          <span className="flex items-center gap-1 bg-orange-900/40 border border-orange-700/50
                           text-orange-300 text-xs px-2 py-0.5 rounded-full shrink-0">
            <TriangleAlert size={10} />Atípica
          </span>
        )}

        {/* Campeão */}
        <span className="font-semibold text-gray-100 w-28 truncate shrink-0">{match.champion}</span>

        {/* K/D/A */}
        <span className={`font-bold text-sm w-20 shrink-0 ${kdaColor(match.kda)}`}>
          {match.kills}/{match.deaths}/{match.assists}
        </span>

        {/* Badges positivos / negativos */}
        <span className="hidden sm:flex items-center gap-1.5 text-xs">
          {hasPositives && (
            <span className="flex items-center gap-1 text-emerald-500 bg-emerald-900/30 px-2 py-0.5 rounded-full">
              <ThumbsUp size={10} />{analysis.positives.length}
            </span>
          )}
          {hasNegatives && (
            <span className="flex items-center gap-1 text-red-400 bg-red-900/30 px-2 py-0.5 rounded-full">
              <ThumbsDown size={10} />{analysis.negatives.length}
            </span>
          )}
        </span>

        {/* Duração */}
        <span className="text-gray-600 text-xs hidden md:flex items-center gap-1 ml-auto shrink-0">
          <Clock size={11} />{match.durationMin}m
        </span>

        {/* Botões da direita */}
        <div className="flex items-center gap-2 ml-auto md:ml-2 shrink-0">
          {/* Análise Completa */}
          <button
            onClick={(e) => { e.stopPropagation(); onOpenDetail(match); }}
            className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300
                       bg-blue-900/30 hover:bg-blue-900/50 border border-blue-800/40
                       px-2.5 py-1 rounded-lg transition-colors font-medium"
          >
            <ExternalLink size={10} />Detalhe
          </button>

          {/* Expand/Collapse */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-gray-600 hover:text-gray-400 transition-colors"
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* Conteúdo expandido (positivos + negativos + veredito) */}
      {expanded && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3 space-y-4">
          <div className="flex flex-wrap gap-4 text-xs text-gray-400">
            <span>KDA <strong className={`${kdaColor(match.kda)} ml-1`}>{match.kda}</strong></span>
            <span>CS/min <strong className="text-white ml-1">{analysis.csPerMin}</strong></span>
            <span>Gold/min <strong className="text-white ml-1">{analysis.goldPerMin}</strong></span>
            <span>Participação <strong className="text-white ml-1">{analysis.killParticipation}%</strong></span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-xl p-3 space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                <ThumbsUp size={11} />O que funcionou
              </p>
              {hasPositives
                ? analysis.positives.map((p, i) => (
                    <p key={i} className="text-emerald-300 text-xs leading-relaxed flex gap-2">
                      <span className="text-emerald-600 shrink-0">✓</span>{p}
                    </p>
                  ))
                : <p className="text-gray-600 text-xs italic">Nada se destacou.</p>
              }
            </div>

            <div className="bg-red-950/30 border border-red-800/30 rounded-xl p-3 space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-red-400 uppercase tracking-wider">
                <ThumbsDown size={11} />O que falhou
              </p>
              {hasNegatives
                ? analysis.negatives.map((n, i) => (
                    <p key={i} className="text-red-300 text-xs leading-relaxed flex gap-2">
                      <span className="text-red-600 shrink-0">✗</span>{n}
                    </p>
                  ))
                : <p className="text-gray-600 text-xs italic">Sem erros críticos.</p>
              }
            </div>
          </div>

          <div className={`rounded-xl px-4 py-2.5 border text-sm font-medium
            ${win
              ? "bg-emerald-900/20 border-emerald-700/30 text-emerald-300"
              : "bg-red-900/20 border-red-700/30 text-red-300"
            }`}
          >
            <span className="text-gray-500 text-xs mr-2">VEREDITO</span>
            {analysis.verdict}
          </div>
        </div>
      )}
    </div>
  );
}

// ── MatchList ─────────────────────────────────────────────────────────────────
export default function MatchList({ matches, puuid }) {
  const [visible,      setVisible]      = useState(PAGE_SIZE);
  const [selectedMatch, setSelectedMatch] = useState(null);

  if (!matches?.length) return null;

  const shown = matches.slice(0, visible);
  const hasMore = visible < matches.length;

  return (
    <>
      <div className="space-y-2">
        {shown.map((m, i) => (
          <MatchCard
            key={m.matchId}
            match={m}
            index={i}
            onOpenDetail={setSelectedMatch}
          />
        ))}

        {/* Ver mais */}
        {hasMore && (
          <button
            onClick={() => setVisible(v => Math.min(v + PAGE_SIZE, matches.length))}
            className="w-full py-2.5 rounded-2xl border border-white/5 bg-surface-700
                       text-gray-400 hover:text-white hover:bg-surface-600 hover:border-white/10
                       transition-all text-sm font-medium flex items-center justify-center gap-2"
          >
            <ChevronDown size={15} />
            Ver mais {Math.min(PAGE_SIZE, matches.length - visible)} partidas
            <span className="text-gray-600 text-xs">({matches.length - visible} restantes)</span>
          </button>
        )}

        {/* "Ver menos" quando tudo expandido */}
        {!hasMore && matches.length > PAGE_SIZE && (
          <button
            onClick={() => setVisible(PAGE_SIZE)}
            className="w-full py-2 text-gray-600 hover:text-gray-400 text-xs transition-colors
                       flex items-center justify-center gap-1"
          >
            <ChevronUp size={12} />Recolher lista
          </button>
        )}
      </div>

      {/* Modal de Análise Completa */}
      {selectedMatch && puuid && (
        <FullMatchAnalysis
          match={selectedMatch}
          puuid={puuid}
          onClose={() => setSelectedMatch(null)}
        />
      )}
    </>
  );
}
