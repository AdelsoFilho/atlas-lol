import { useState, useCallback } from "react";
import { Crosshair, X, Plus, Loader2, AlertCircle, Shield, Zap, Target } from "lucide-react";
import axios from "axios";

// =============================================================================
// DraftView — Draft Assistant Pré-Game
//
// O usuário insere os campeões inimigos (até 5) e o sistema retorna:
//   · Counter-picks recomendados
//   · Itens de counter
//   · Dicas de counterplay (do champion_strategies.json)
// =============================================================================

const KNOWN_CHAMPIONS = [
  "Yasuo","Yone","Zed","Lee Sin","Jinx","Thresh","Ahri","Lux","Nautilus","Caitlyn",
  "Vi","Darius","Vayne","Jhin","Kayn","Sylas","Blitzcrank","Fizz","Katarina","Garen",
  "Malphite","Wukong","Renekton","Pantheon","Tryndamere","Quinn",
];

function ChampionInput({ value, onChange, onAdd, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);

  function handleInput(e) {
    const v = e.target.value;
    onChange(v);
    if (v.length >= 2) {
      setSuggestions(
        KNOWN_CHAMPIONS.filter(c => c.toLowerCase().startsWith(v.toLowerCase())).slice(0, 5)
      );
    } else {
      setSuggestions([]);
    }
  }

  function pick(champ) {
    onAdd(champ);
    onChange("");
    setSuggestions([]);
  }

  return (
    <div className="relative">
      <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) pick(value.trim()); }}>
        <input
          value={value}
          onChange={handleInput}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full bg-navy-950 border border-white/10 rounded-xl px-4 py-3
                     text-slate-200 placeholder-slate-600 text-sm focus:outline-none
                     focus:border-electric/50 focus:ring-1 focus:ring-electric/20
                     transition-all font-sans"
        />
      </form>
      {suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-navy-900 border border-white/10
                        rounded-xl overflow-hidden z-50 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          {suggestions.map(s => (
            <button
              key={s}
              onMouseDown={() => pick(s)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-left text-sm text-slate-300"
            >
              <span className="w-7 h-7 rounded-lg bg-electric/10 border border-electric/20
                               text-electric text-[10px] font-black flex items-center justify-center shrink-0">
                {s.slice(0, 2)}
              </span>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Result Cards ──────────────────────────────────────────────────────────────

function StrategyCard({ champ, data }) {
  return (
    <div className="card hover-glow space-y-4 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-neon-red/10 border border-neon-red/30
                        text-neon-red font-black text-sm flex items-center justify-center shrink-0">
          {champ.slice(0, 2)}
        </div>
        <div>
          <p className="font-bold text-white text-base">{champ}</p>
          <p className="text-slate-500 text-xs capitalize">{data.role}</p>
        </div>
      </div>

      {/* Play style */}
      <p className="text-slate-400 text-xs leading-relaxed border-l-2 border-electric/40 pl-3">
        {data.playStyle}
      </p>

      {/* Counter picks */}
      {data.hardCounters?.length > 0 && (
        <div className="space-y-2">
          <p className="label-xs flex items-center gap-1.5">
            <Shield size={10} />Melhores Counter-picks
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.hardCounters.map(c => (
              <span key={c} className="tag-cyan">{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* Counter items */}
      {data.counterItems?.length > 0 && (
        <div className="space-y-2">
          <p className="label-xs flex items-center gap-1.5">
            <Target size={10} />Itens de Counter
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.counterItems.map(item => (
              <span key={item} className="tag-yellow">{item}</span>
            ))}
          </div>
        </div>
      )}

      {/* Level spikes */}
      {data.levelTriggers && (
        <div className="space-y-2">
          <p className="label-xs flex items-center gap-1.5">
            <Zap size={10} />Alertas de Nível
          </p>
          <div className="space-y-1.5">
            {Object.entries(data.levelTriggers).map(([lvl, tip]) => (
              <div key={lvl} className="flex items-start gap-2">
                <span className={`text-[10px] font-black font-mono shrink-0 px-1.5 py-0.5 rounded border
                  ${lvl === "16" ? "bg-neon-red/10 border-neon-red/30 text-neon-red"
                  : lvl === "11" ? "bg-yellow-900/30 border-yellow-700/30 text-yellow-400"
                  :                "bg-orange-900/30 border-orange-700/30 text-orange-400"
                  }`}>
                  {lvl}
                </span>
                <p className="text-xs text-slate-400 leading-relaxed">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* General tips (top 2) */}
      {data.generalTips?.length > 0 && (
        <div className="space-y-2">
          <p className="label-xs">Dicas de Counterplay</p>
          {data.generalTips.slice(0, 2).map((t, i) => (
            <p key={i} className="text-xs text-slate-400 leading-relaxed flex gap-2">
              <span className="text-electric shrink-0">▸</span>{t}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function DraftView() {
  const [enemies, setEnemies]   = useState([]);
  const [input,   setInput]     = useState("");
  const [results, setResults]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState(null);

  function addEnemy(champ) {
    if (enemies.length >= 5 || enemies.includes(champ)) return;
    setEnemies(prev => [...prev, champ]);
    setResults(null);
  }

  function removeEnemy(champ) {
    setEnemies(prev => prev.filter(c => c !== champ));
    setResults(null);
  }

  async function analyze() {
    if (enemies.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.post("/api/draft", { enemies });
      setResults(data);
    } catch (err) {
      setError(err.response?.data?.error ?? "Erro ao analisar composição inimiga.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-8 py-8 space-y-8 max-w-5xl animate-fade-up">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Crosshair size={20} className="text-electric" />
        <div>
          <h1 className="text-xl font-bold text-white">Draft Assistant</h1>
          <p className="text-slate-500 text-xs font-mono mt-0.5">
            Analise a composição inimiga e escolha o melhor counter
          </p>
        </div>
      </div>

      {/* ── Input area ──────────────────────────────────────────────────── */}
      <div className="card space-y-4">
        <p className="label-xs">Campeões inimigos ({enemies.length}/5)</p>

        {/* Selected enemies */}
        {enemies.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {enemies.map(c => (
              <div key={c}
                   className="flex items-center gap-2 bg-neon-red/10 border border-neon-red/30
                              rounded-xl px-3 py-1.5">
                <span className="text-sm font-semibold text-slate-200">{c}</span>
                <button onClick={() => removeEnemy(c)} className="text-slate-600 hover:text-neon-red transition-colors">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        {enemies.length < 5 && (
          <ChampionInput
            value={input}
            onChange={setInput}
            onAdd={addEnemy}
            placeholder={enemies.length === 0 ? "Yasuo, Zed, Yone… (enter ou clique)" : "Adicionar mais inimigos…"}
          />
        )}

        {/* Quick picks */}
        <div>
          <p className="label-xs mb-2">Picks rápidos</p>
          <div className="flex flex-wrap gap-1.5">
            {KNOWN_CHAMPIONS.filter(c => !enemies.includes(c)).slice(0, 12).map(c => (
              <button
                key={c}
                onClick={() => addEnemy(c)}
                disabled={enemies.length >= 5}
                className="text-xs px-2.5 py-1 rounded-lg border border-white/10
                           text-slate-500 hover:text-slate-200 hover:border-electric/30
                           hover:bg-electric/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Analyze button */}
        <button
          onClick={analyze}
          disabled={enemies.length === 0 || loading}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading ? (
            <><Loader2 size={14} className="animate-spin" />Analisando…</>
          ) : (
            <><Crosshair size={14} />Analisar Composição ({enemies.length} campeões)</>
          )}
        </button>

        {error && (
          <div className="flex items-start gap-2 text-neon-red/80 text-xs bg-neon-red/10
                          border border-neon-red/25 rounded-xl px-3 py-2.5">
            <AlertCircle size={11} className="mt-0.5 shrink-0" />{error}
          </div>
        )}
      </div>

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {results && (
        <div className="space-y-4">
          {/* Summary */}
          {results.summary && (
            <div className="card bg-electric/5 border border-electric/25">
              <p className="label-xs text-electric mb-2 flex items-center gap-1.5">
                <Shield size={10} />Resumo Tático
              </p>
              <p className="text-slate-300 text-sm leading-relaxed">{results.summary}</p>
            </div>
          )}

          {/* Per-champion strategy */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {results.strategies?.map(({ champion, data }) => (
              <StrategyCard key={champion} champ={champion} data={data} />
            ))}
          </div>

          {/* Unknown champions */}
          {results.unknown?.length > 0 && (
            <p className="text-slate-600 text-xs font-mono">
              Sem dados para: {results.unknown.join(", ")} — adicione ao champion_strategies.json
            </p>
          )}
        </div>
      )}
    </div>
  );
}
