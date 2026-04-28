import { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Shield, LayoutDashboard, History, Crosshair,
  Settings, Search, Loader2, ChevronRight, X,
} from "lucide-react";
import { usePlayer } from "../context/PlayerContext";
import { useSearchHistory } from "../hooks/useSearchHistory";

// =============================================================================
// Sidebar — Navegação fixa lateral
//
// Contém:
//   · Logo + branding
//   · Campo de busca compacto com histórico recente
//   · Card do jogador atualmente analisado
//   · Links de navegação com active state
//   · Footer com nota de disclaimer
// =============================================================================

const NAV_ITEMS = [
  { to: "/",        icon: LayoutDashboard, label: "Dashboard",   end: true  },
  { to: "/history", icon: History,         label: "Histórico",   end: false },
  { to: "/draft",   icon: Crosshair,       label: "Draft",       end: false },
  { to: "/settings",icon: Settings,        label: "Configurações",end: false },
];

function wrColor(wr) {
  if (!wr) return "text-slate-500";
  return wr >= 60 ? "text-emerald-400"
       : wr >= 50 ? "text-emerald-500"
       : wr >= 45 ? "text-yellow-400"
       : "text-neon-red";
}

export default function Sidebar() {
  const { search, loading, playerData } = usePlayer();
  const { history, removeFromHistory }  = useSearchHistory();
  const navigate    = useNavigate();
  const [input,     setInput]    = useState("");
  const [focused,   setFocused]  = useState(false);
  const containerRef = useRef(null);

  const filteredHistory = input.trim()
    ? history.filter(h =>
        h.riotId.toLowerCase().includes(input.toLowerCase()) ||
        (h.gameName ?? "").toLowerCase().startsWith(input.toLowerCase())
      )
    : history.slice(0, 6);

  async function handleSearch(riotId) {
    const id = (riotId ?? input).trim();
    if (!id) return;
    setInput("");
    setFocused(false);
    await search(id);
    navigate("/");
  }

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-navy-900 border-r border-white/8
                      flex flex-col z-20 shadow-[2px_0_20px_rgba(0,0,0,0.4)]">

      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-electric/15 border border-electric/40
                        flex items-center justify-center shrink-0 animate-glow-pulse">
          <Shield size={15} className="text-electric" />
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-none tracking-wide">Atlas</p>
          <p className="text-slate-600 text-[10px] mt-0.5 font-mono">Pro Analytics</p>
        </div>
      </div>

      {/* ── Busca compacta ────────────────────────────────────────────────── */}
      <div ref={containerRef} className="px-3 py-3 border-b border-white/5 relative shrink-0">
        <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }}>
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
            {loading ? (
              <Loader2 size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-electric animate-spin" />
            ) : input ? (
              <button
                type="button"
                onClick={() => setInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
              >
                <X size={11} />
              </button>
            ) : null}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setFocused(true)}
              placeholder="Nome#TAG"
              disabled={loading}
              autoComplete="off"
              className="w-full bg-navy-950 border border-white/10 rounded-xl pl-8 pr-8 py-2
                         text-slate-200 placeholder-slate-600 text-xs focus:outline-none
                         focus:border-electric/50 focus:ring-1 focus:ring-electric/20
                         disabled:opacity-40 transition-all font-sans"
            />
          </div>
        </form>

        {/* Dropdown de histórico */}
        {focused && filteredHistory.length > 0 && (
          <div className="absolute left-3 right-3 mt-1 bg-navy-950 border border-white/10
                          rounded-xl overflow-hidden z-50 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
            {filteredHistory.map((entry) => (
              <div
                key={entry.riotId}
                className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 cursor-pointer group"
                onMouseDown={() => handleSearch(entry.riotId)}
              >
                <div className="w-5 h-5 rounded bg-electric/15 text-electric text-[9px] font-bold
                                flex items-center justify-center shrink-0">
                  {(entry.gameName ?? "?")[0].toUpperCase()}
                </div>
                <span className="text-xs text-slate-300 flex-1 truncate min-w-0">
                  {entry.gameName}
                  <span className="text-slate-600 font-mono">#{entry.tagLine}</span>
                </span>
                {entry.winrate != null && (
                  <span className={`text-[10px] font-mono font-bold shrink-0 ${wrColor(entry.winrate)}`}>
                    {entry.winrate}%
                  </span>
                )}
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-700 hover:text-neon-red shrink-0 p-0.5"
                  onMouseDown={(e) => { e.stopPropagation(); removeFromHistory(entry.riotId); }}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Jogador atual ─────────────────────────────────────────────────── */}
      {playerData && (
        <div className="px-3 py-3 border-b border-white/5 shrink-0">
          <div className="bg-navy-950 border border-electric/20 rounded-xl px-3 py-2.5
                          hover:border-electric/40 transition-colors">
            <p className="label-xs mb-1.5">Analisando</p>
            <p className="text-sm font-bold text-slate-200 leading-none truncate">
              {playerData.gameName}
              <span className="text-electric font-mono text-xs ml-1">#{playerData.tagLine}</span>
            </p>
            {playerData.stats && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-xs font-mono font-bold ${wrColor(playerData.stats.winrate)}`}>
                  {playerData.stats.winrate}% WR
                </span>
                <span className="text-slate-700 text-xs">·</span>
                <span className="text-xs text-slate-500 font-mono">KDA {playerData.stats.kda}</span>
                <span className="text-slate-700 text-xs">·</span>
                <span className="text-xs text-electric/70 font-mono truncate">
                  {playerData.stats.topChampion}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Navegação ─────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
               transition-all duration-150 group ${
                isActive
                  ? "bg-electric/10 border border-electric/25 text-electric shadow-electric-sm"
                  : "text-slate-500 hover:text-slate-200 hover:bg-white/5 border border-transparent"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={15}
                  className={isActive ? "text-electric" : "text-slate-600 group-hover:text-slate-300 transition-colors"}
                />
                <span className="flex-1">{label}</span>
                {isActive && <ChevronRight size={12} className="text-electric/50" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-t border-white/5 shrink-0">
        <p className="text-[10px] text-slate-700 font-mono leading-relaxed">
          Atlas v2 · não afiliado à Riot<br />
          dados via Riot API Match-v5
        </p>
      </div>
    </aside>
  );
}
