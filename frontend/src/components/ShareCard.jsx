import { useState } from "react";
import { Share2, Download, Copy, Check, X } from "lucide-react";

// =============================================================================
// ShareCard.jsx — Cartão de Performance para Compartilhamento
//
// Gera PNG via Canvas 2D nativo do browser — zero dependências externas.
// Fallback: copia resumo em texto para clipboard.
//
// Props:
//   riotId  {string}
//   stats   {object} — stats agregados do /api/player
//   matches {Array}  — recentMatches (para top campeão)
// =============================================================================

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// Desenha retângulo com cantos arredondados no canvas
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Gera o PNG via Canvas 2D — sem pacotes externos
function generatePng(riotId, stats, topChamp) {
  const wr    = stats?.winrate ?? 0;
  const kda   = String(stats?.kda ?? "—");
  const gold  = String(stats?.avgGoldPerMin ?? "—");
  const games = stats?.gamesPlayed ?? 0;
  const name  = riotId?.split("#")[0] ?? "—";
  const tag   = riotId?.split("#")[1] ?? "—";
  const champ = topChamp?.champion ?? "—";

  const wrHex = wr >= 55 ? "#34d399" : wr >= 50 ? "#60a5fa" : wr >= 45 ? "#fbbf24" : "#f87171";
  const goldHex = Number(stats?.avgGoldPerMin) >= 350 ? "#34d399" : "#fbbf24";

  const W = 400, H = 210, DPR = 2;
  const canvas = document.createElement("canvas");
  canvas.width  = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext("2d");
  ctx.scale(DPR, DPR);

  // ── Fundo ────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#0f172a";
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.stroke();

  // ── Avatar ───────────────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(37,99,235,0.3)";
  roundRect(ctx, 20, 18, 46, 46, 10);
  ctx.fill();

  ctx.fillStyle = "#93c5fd";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name[0]?.toUpperCase() ?? "?", 43, 41);

  // ── Nome ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 17px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(name, 76, 36);

  ctx.fillStyle = "#64748b";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(`#${tag}  ·  ${games} partidas`, 76, 55);

  // ── Winrate (canto direito) ───────────────────────────────────────────────
  ctx.fillStyle = wrHex;
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`${wr}%`, W - 20, 42);

  ctx.fillStyle = "#475569";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText("WR", W - 20, 57);

  // ── Divisória ────────────────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, 76);
  ctx.lineTo(W - 20, 76);
  ctx.stroke();

  // ── 3 mini cards de stats ────────────────────────────────────────────────
  const cols = [
    { label: "KDA",       value: kda,   color: "#60a5fa" },
    { label: "Gold/min",  value: gold,  color: goldHex   },
    { label: "Top pick",  value: champ, color: "#c084fc" },
  ];
  const colW = (W - 40) / 3;

  cols.forEach(({ label, value, color }, i) => {
    const x = 20 + i * colW;

    ctx.fillStyle = "rgba(255,255,255,0.03)";
    roundRect(ctx, x + 3, 86, colW - 8, 64, 10);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    // Truncate long champion names
    const displayValue = value.length > 10 ? value.slice(0, 9) + "…" : value;
    ctx.fillText(displayValue, x + colW / 2, 122);

    ctx.fillStyle = "#475569";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText(label, x + colW / 2, 138);
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#334155";
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("atlas-lol.render.com", 20, H - 14);

  ctx.fillStyle = "#3b82f6";
  ctx.beginPath();
  ctx.arc(W - 55, H - 18, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#475569";
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Atlas LoL", W - 48, H - 14);

  return canvas.toDataURL("image/png");
}

// ── Preview do card (versão HTML, só para exibição no modal) ─────────────────

function CardPreview({ riotId, stats, topChamp }) {
  const wr    = stats?.winrate ?? 0;
  const kda   = stats?.kda ?? "—";
  const gold  = stats?.avgGoldPerMin ?? "—";
  const games = stats?.gamesPlayed ?? 0;
  const wrColor = wr >= 55 ? "text-emerald-400" : wr >= 50 ? "text-blue-400" : wr >= 45 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="bg-surface-900 border border-white/8 rounded-3xl p-5 space-y-4 w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-blue-600/30 border border-blue-600/30
                        flex items-center justify-center text-blue-300 font-bold text-lg shrink-0">
          {riotId?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div>
          <p className="text-white font-bold leading-none">{riotId?.split("#")[0] ?? "—"}</p>
          <p className="text-gray-500 text-xs mt-0.5">
            #{riotId?.split("#")[1] ?? "—"} · {games} partidas
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className={`text-2xl font-black ${wrColor}`}>{wr}%</p>
          <p className="text-gray-600 text-xs">WR</p>
        </div>
      </div>

      <div className="h-px bg-white/5" />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "KDA",      value: kda,                          cls: "text-blue-400"   },
          { label: "Gold/min", value: gold,                         cls: Number(gold) >= 350 ? "text-emerald-400" : "text-yellow-400" },
          { label: "Top pick", value: topChamp?.champion ?? "—",    cls: "text-purple-400" },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-surface-800 rounded-2xl px-2 py-2.5 space-y-0.5">
            <p className={`text-sm font-bold truncate ${cls}`}>{value}</p>
            <p className="text-gray-600 text-xs">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-gray-700 text-xs">atlas-lol.render.com</p>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <p className="text-gray-600 text-xs">Atlas LoL</p>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ShareCard({ riotId, stats, matches }) {
  const [open,      setOpen]      = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [exporting, setExporting] = useState(false);

  const topChamp = topChampion(matches);

  function handleDownloadPng() {
    setExporting(true);
    try {
      const dataUrl = generatePng(riotId, stats, topChamp);
      const link = document.createElement("a");
      link.download = `atlas-${(riotId ?? "player").replace("#", "-")}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // fallback silencioso
    } finally {
      setExporting(false);
    }
  }

  async function handleCopyText() {
    const wr    = stats?.winrate ?? "?";
    const kda   = stats?.kda ?? "?";
    const gold  = stats?.avgGoldPerMin ?? "?";
    const games = stats?.gamesPlayed ?? "?";
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
            {/* Header */}
            <div className="flex items-center justify-between">
              <p className="text-white font-semibold text-sm">Compartilhar Perfil</p>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Preview HTML */}
            <CardPreview riotId={riotId} stats={stats} topChamp={topChamp} />

            {/* Botões */}
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
          </div>
        </div>
      )}
    </>
  );
}
