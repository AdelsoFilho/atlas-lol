import { useState, useEffect } from "react";
import axios from "axios";
import {
  Target,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Gift,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// =============================================================================
// MissionControl.jsx — Missões Diárias Dinâmicas
//
// Consome GET /api/quests/:riotId e exibe 3 missões com:
//   · Estado visual: Pendente → Em Progresso → Completa
//   · "Claim Reward" simulado localmente
//   · Dica "Como fazer" expansível
//
// Props:
//   riotId {string} — "GameName#TAG"
// =============================================================================

const SEV_COLORS = {
  alta:  { border: "border-red-700/30",    bg: "bg-red-900/10",    badge: "text-red-300 bg-red-900/40 border-red-700/40"    },
  média: { border: "border-yellow-700/30", bg: "bg-yellow-900/10", badge: "text-yellow-300 bg-yellow-900/40 border-yellow-700/40" },
  baixa: { border: "border-blue-700/30",   bg: "bg-blue-900/10",   badge: "text-blue-300 bg-blue-900/40 border-blue-700/40"   },
};

// Estado possível por missão: "pending" | "inprogress" | "done"
function QuestCard({ quest, questState, onStateChange }) {
  const [expanded, setExpanded] = useState(false);

  const sev    = SEV_COLORS[quest.severity] ?? SEV_COLORS.baixa;
  const isDone = questState === "done";
  const isInProgress = questState === "inprogress";

  return (
    <div className={`rounded-2xl border p-4 space-y-3 transition-all ${sev.border} ${sev.bg} ${isDone ? "opacity-60" : ""}`}>

      {/* ── Header da missão ───────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        {/* Ícone de status */}
        <button
          onClick={() => {
            if (isDone) return;
            onStateChange(isInProgress ? "pending" : "inprogress");
          }}
          className="mt-0.5 shrink-0"
          title={isInProgress ? "Marcar como pendente" : "Iniciar missão"}
        >
          {isDone
            ? <CheckCircle2 size={20} className="text-emerald-400" />
            : isInProgress
              ? <Clock size={20} className="text-blue-400 animate-pulse" />
              : <Circle size={20} className="text-gray-600 hover:text-gray-400 transition-colors" />
          }
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-lg leading-none">{quest.icon}</span>
            <p className={`text-sm font-bold ${isDone ? "line-through text-gray-600" : "text-white"}`}>
              {quest.title}
            </p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border uppercase ${sev.badge}`}>
              {quest.severity}
            </span>
            <span className="text-xs text-gray-600 border border-white/5 bg-surface-700 px-2 py-0.5 rounded-full">
              {quest.category}
            </span>
          </div>
          <p className={`text-xs leading-relaxed ${isDone ? "text-gray-600" : "text-gray-300"}`}>
            {quest.desc}
          </p>

          {/* Stat atual */}
          {quest.currentAvg != null && (
            <p className="text-gray-600 text-xs mt-1">
              Média atual:{" "}
              <span className="text-gray-400 font-mono">{quest.currentAvg}</span>
              {quest.target != null && (
                <span className="text-gray-700">
                  {" "}→ meta:{" "}
                  <span className="text-gray-500 font-mono">{quest.target}</span>
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* ── Dica expansível ────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full text-left"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Como fazer
      </button>
      {expanded && (
        <p className="text-xs text-gray-400 leading-relaxed bg-surface-700 border border-white/5 rounded-xl px-3 py-2">
          {quest.howTo}
        </p>
      )}

      {/* ── Ações ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5">
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <Gift size={11} />
          <span>{quest.reward.label}</span>
          <span className="text-gray-700">·</span>
          <span className="text-blue-400 font-mono">+{quest.reward.xp} XP</span>
        </div>

        {!isDone && isInProgress && (
          <button
            onClick={() => onStateChange("done")}
            className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 hover:bg-emerald-600/30 transition-colors"
          >
            ✓ Claim Reward
          </button>
        )}
        {isDone && (
          <span className="text-xs text-emerald-500 font-semibold">✓ Concluída!</span>
        )}
      </div>
    </div>
  );
}

export default function MissionControl({ riotId }) {
  const [phase,      setPhase]      = useState("loading");
  const [data,       setData]       = useState(null);
  const [errorMsg,   setErrorMsg]   = useState("");
  const [questStates, setQuestStates] = useState({}); // questKey → state

  useEffect(() => {
    if (!riotId) return;
    let cancelled = false;

    async function load() {
      setPhase("loading");
      try {
        const { data: res } = await axios.get(
          `/api/quests/${encodeURIComponent(riotId)}`,
        );
        if (!cancelled) {
          setData(res);
          setPhase("success");
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err.response?.data?.error ?? err.message ?? "Erro ao carregar missões.");
          setPhase("error");
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [riotId]);

  const setQuestState = (questKey, state) => {
    setQuestStates(prev => ({ ...prev, [questKey]: state }));
  };

  const doneCount = Object.values(questStates).filter(s => s === "done").length;
  const totalQuests = data?.quests?.length ?? 0;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 rounded-2xl bg-surface-700" />
        ))}
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="card space-y-3">
        <div className="flex items-start gap-3 bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-red-300 text-sm">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  const quests = data?.quests ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Target size={15} className="text-purple-400" />
        <h3 className="font-semibold text-white">Missões do Dia</h3>
        {totalQuests > 0 && (
          <span className="ml-auto text-xs text-gray-600">
            {doneCount}/{totalQuests} concluídas
          </span>
        )}
        {data?.basedOn > 0 && (
          <span className="text-xs text-gray-700">
            · base: {data.basedOn} partidas
          </span>
        )}
      </div>

      {/* Barra de progresso geral */}
      {totalQuests > 0 && (
        <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.round((doneCount / totalQuests) * 100)}%` }}
          />
        </div>
      )}

      {/* Cards de missão */}
      <div className="space-y-3">
        {quests.map(quest => (
          <QuestCard
            key={quest.questKey}
            quest={quest}
            questState={questStates[quest.questKey] ?? "pending"}
            onStateChange={(state) => setQuestState(quest.questKey, state)}
          />
        ))}
      </div>

      {/* Conclusão geral */}
      {doneCount === totalQuests && totalQuests > 0 && (
        <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm py-2">
          <CheckCircle2 size={16} />
          Todas as missões concluídas! Analise de novo após 10 partidas.
        </div>
      )}

      {/* Rodapé */}
      {data?.generatedAt && (
        <p className="text-gray-700 text-xs text-right">
          Missões geradas às{" "}
          {new Date(data.generatedAt).toLocaleTimeString("pt-BR", {
            hour: "2-digit", minute: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}
