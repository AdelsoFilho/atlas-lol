import { useRef, useState } from "react";
import { Share2, Download, Copy, Check, X } from "lucide-react";

// =============================================================================
// ShareCard.jsx — Cartão de Performance para Compartilhamento
//
// Renderiza um card estético com as principais métricas do jogador.
// Exporta como PNG usando html-to-image (instale com: npm install html-to-image).
// Fallback: copia resumo em texto para clipboard.
//
// Props:
//   riotId  {string}
//   stats   {object} — stats agregados do /api/player
//   matches {Array}  — recentMatches (para top campeão)
// =============================================================================

// Calcula top campeão pelo winrate
function topChampion(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return null;
  const map = {};
  for (const m of matches) {
    if (!map[m.champion]) map[m.champion] = { wins: 0, games: 0 };
    map[m.champion].games++;
    if (m.win) map[m.champion].wins++;
  }
  return Object.entries(map)
    .filter(([, d]) => d.games >= 2)
    .map(([c, d]) => ({ champion: c, wr: Math.round((d.wins / d.games) * 100), games: d.games }))
    .sort((a, b) => b.wr - a.wr)[0] ?? null;
}

// ── Card visual (o elemento que será capturado como PNG) ─────────────────────

function CardContent({ riotId, stats, topChamp }) {
  const wr    = stats?.winrate ?? 0;
  const kda   = stats?.kda     ?? "—";
  const gold  = stats?.avgGoldPerMin ?? "—";
  const games = stats?.gamesPlayed   ?? 0;

  const wrColor = wr >= 55 ? "#34d399" : wr >= 50 ? "#60a5fa" : wr >= 45 ? "#fbbf24" : "#f87171";

  return (
    <div className="bg-surface-900 border border-white/10 rounded-3xl p-6 space-y-5 w-full max-w-sm">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white text-lg shrink-0">
          {riotId?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div>
          <p className="text-white font-bold leading-none">{riotId?.split("#")[0] ?? "—"}</p>
          <p className="text-gray-500 text-xs mt-0.5">
            #{riotId?.split("#")[1] ?? "—"} · {games} partidas
          </p>
        </div>
        <div className="ml-auto">
          <p className="text-2xl font-black" style={{ color: wrColor }}>{wr}%</p>
          <p className="text-gray-600 text-xs text-right">WR</p>
        </div>
      </div>

      {/* Linha divisória */}
      <div className="h-px bg-white/5" />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: "KDA",       value: kda,   color: "text-blue-400" },
          { label: "Gold/min",  value: gold,  color: gold >= 350 ? "text-emerald-400" : "text-yellow-400" },
          { label: "Top pick",  value: topChamp?.champion ?? "—", color: "text-purple-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-surface-800 rounded-2xl p-2.5 space-y-0.5">
            <p className={`text-base font-bold leading-none ${color}`}>{value}</p>
            <p className="text-gray-600 text-xs">{label}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-gray-700 text-xs">atlas-lol.render.com</p>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <p className="text-gray-600 text-xs font-medium">Atlas LoL</p>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ShareCard({ riotId, stats, matches }) {
  const [open,    setOpen]    = useState(false);
  const [copied,  setCopied]  = useState(false);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef(null);

  const topChamp = topChampion(matches);

  async function handleDownloadPng() {
    setExporting(true);
    try {
      // Tenta importar html-to-image dinamicamente
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, { quality: 0.95, pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `atlas-${riotId?.replace("#", "-")}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // html-to-image não instalado — fallback para texto
      await handleCopyText();
    } finally {
      setExporting(false);
    }
  }

  async function handleCopyText() {
    const wr    = stats?.winrate ?? "?";
    const kda   = stats?.kda     ?? "?";
    const gold  = stats?.avgGoldPerMin ?? "?";
    const games = stats?.gamesPlayed   ?? "?";
    const text  = [
      `📊 Atlas LoL — ${riotId}`,
      `🏆 Winrate: ${wr}%  |  ⚔️ KDA: ${kda}  |  🪙 Gold/min: ${gold}`,
      topChamp ? `🎯 Melhor pick: ${topChamp.champion} (${topChamp.wr}% WR em ${topChamp.games} jogos)` : "",
      `📈 Baseado em ${games} partidas recentes`,
      `🔗 atlas-lol.render.com`,
    ].filter(Boolean).join("\n");

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <>
      {/* Botão de acionamento */}
      <button
        onClick={() => setOpen(true)}
        title="Compartilhar perfil"
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300
                   border border-white/10 hover:border-white/20 bg-surface-800 hover:bg-surface-700
                   px-3 py-1.5 rounded-full transition-all"
      >
        <Share2 size={12} />Compartilhar
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-surface-800 border border-white/10 rounded-3xl p-5 space-y-4 w-full max-w-sm shadow-2xl">
            {/* Header modal */}
            <div className="flex items-center justify-between">
              <p className="text-white font-semibold text-sm">Compartilhar Perfil</p>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Preview do card */}
            <div ref={cardRef}>
              <CardContent riotId={riotId} stats={stats} topChamp={topChamp} />
            </div>

            {/* Botões de ação */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDownloadPng}
                disabled={exporting}
                className="flex items-center justify-center gap-2 text-sm font-semibold
                           bg-blue-600/20 border border-blue-600/40 text-blue-300
                           hover:bg-blue-600/30 rounded-2xl py-2.5 transition-colors disabled:opacity-50"
              >
                <Download size={14} />
                {exporting ? "Gerando…" : "Baixar PNG"}
              </button>
              <button
                onClick={handleCopyText}
                className="flex items-center justify-center gap-2 text-sm font-semibold
                           bg-surface-700 border border-white/10 text-gray-300
                           hover:bg-surface-600 rounded-2xl py-2.5 transition-colors"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copied ? "Copiado!" : "Copiar Texto"}
              </button>
            </div>

            <p className="text-gray-700 text-xs text-center">
              PNG requer{" "}
              <code className="bg-surface-700 px-1 rounded text-gray-500">npm install html-to-image</code>
              {" "}no frontend. Texto funciona sem instalar.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
