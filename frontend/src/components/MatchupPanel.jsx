import { useState, useEffect } from "react";
import axios from "axios";
import { Swords, Shield, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

// =============================================================================
// MatchupPanel.jsx — Kryptonitas e Pontos Fortes de Matchup
//
// Consome GET /api/matchups/:riotId e exibe:
//   · Kryptonitas (campeões inimigos com alta loss rate)
//   · Pontos fortes (matchups onde o jogador domina)
//   · Prioridade de ban
//
// Props:
//   riotId {string}
// =============================================================================

function ChampRow({ champion, rate, label, color, bg, appearances }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${bg}`}>
      <div className={`w-2 h-2 rounded-full shrink-0 ${color === "red" ? "bg-red-500" : "bg-emerald-500"}`} />
      <span className="text-white text-sm font-medium flex-1">{champion}</span>
      <span className="text-gray-600 text-xs">{appearances}x</span>
      <span className={`text-xs font-bold font-mono ${color === "red" ? "text-red-400" : "text-emerald-400"}`}>
        {rate}% {label}
      </span>
    </div>
  );
}

export default function MatchupPanel({ riotId }) {
  const [phase,    setPhase]    = useState("loading");
  const [data,     setData]     = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!riotId) return;
    let cancelled = false;

    async function load() {
      setPhase("loading");
      try {
        const { data: res } = await axios.get(
          `/api/matchups/${encodeURIComponent(riotId)}`,
        );
        if (!cancelled) { setData(res); setPhase("success"); }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err.response?.data?.error ?? err.message ?? "Erro ao carregar matchups.");
          setPhase("error");
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [riotId]);

  if (phase === "loading") {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-xl bg-surface-700" />)}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex items-start gap-3 bg-red-900/20 border border-red-700/30 rounded-xl px-4 py-3 text-red-300 text-sm">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />{errorMsg}
      </div>
    );
  }

  const krypt   = data?.kryptonites   ?? [];
  const strong  = data?.strongPoints  ?? [];
  const banPrio = data?.banPriority   ?? [];
  const noData  = krypt.length === 0 && strong.length === 0;

  return (
    <div className="space-y-5">
      {/* Ban Priority */}
      {banPrio.length > 0 && (
        <div className="card border border-red-700/20 bg-red-900/10 space-y-3">
          <div className="flex items-center gap-2">
            <Swords size={14} className="text-red-400" />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Prioridade de Ban</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {banPrio.map((champ, i) => (
              <span key={champ} className="flex items-center gap-1.5 text-sm font-semibold
                                           bg-red-900/40 border border-red-700/40 text-red-300
                                           px-3 py-1 rounded-full">
                <span className="text-xs text-red-500">#{i + 1}</span>
                {champ}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Kryptonitas */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <TrendingDown size={14} className={krypt.length > 0 ? "text-red-400" : "text-gray-500"} />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Kryptonitas</p>
          </div>
          {krypt.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhuma kryptonita detectada. 💪</p>
          ) : (
            <div className="space-y-2">
              {krypt.map(k => (
                <ChampRow
                  key={k.champion}
                  champion={k.champion}
                  rate={k.lossRate}
                  label="derrota"
                  color="red"
                  bg="border-red-700/20 bg-red-900/10"
                  appearances={k.appearances}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pontos Fortes */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className={strong.length > 0 ? "text-emerald-400" : "text-gray-500"} />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Pontos Fortes</p>
          </div>
          {strong.length === 0 ? (
            <p className="text-gray-500 text-sm">Amostra insuficiente para pontos fortes.</p>
          ) : (
            <div className="space-y-2">
              {strong.map(s => (
                <ChampRow
                  key={s.champion}
                  champion={s.champion}
                  rate={s.winRate}
                  label="vitória"
                  color="green"
                  bg="border-emerald-700/20 bg-emerald-900/10"
                  appearances={s.appearances}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {noData && (
        <div className="card text-center py-8 text-gray-500 text-sm">
          Amostra insuficiente para análise de matchups. Jogue mais partidas com o mesmo campeão.
        </div>
      )}

      {data?.summary && (
        <p className="text-gray-600 text-xs">{data.summary}</p>
      )}
    </div>
  );
}
