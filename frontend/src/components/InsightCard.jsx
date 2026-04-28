// =============================================================================
// InsightCard — Card reutilizável de análise/coaching
//
// Props:
//   icon   string    — emoji ou texto curto
//   title  string    — título do insight
//   body   string    — descrição principal
//   meta   string?   — metadado secundário (ex: "Min 24 · 4k gold deficit")
//   type   "success" | "warning" | "info" | "neutral"
// =============================================================================

const TYPE_STYLES = {
  success: {
    border:  "border-emerald-700/40",
    bg:      "bg-emerald-950/20",
    title:   "text-emerald-400",
    dot:     "bg-emerald-500",
  },
  warning: {
    border:  "border-yellow-700/35",
    bg:      "bg-yellow-950/15",
    title:   "text-yellow-400",
    dot:     "bg-yellow-500",
  },
  info: {
    border:  "border-electric/25",
    bg:      "bg-electric/5",
    title:   "text-electric",
    dot:     "bg-electric",
  },
  neutral: {
    border:  "border-white/8",
    bg:      "bg-navy-950/50",
    title:   "text-slate-300",
    dot:     "bg-slate-500",
  },
};

export default function InsightCard({ icon, title, body, meta, type = "neutral" }) {
  const style = TYPE_STYLES[type] ?? TYPE_STYLES.neutral;

  return (
    <div className={`flex flex-col gap-3 p-4 rounded-xl border ${style.border} ${style.bg}
                     hover-glow transition-all`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{icon}</span>
        <span className={`text-xs font-bold ${style.title} flex-1`}>{title}</span>
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot} shrink-0`} />
      </div>

      {/* Body */}
      <p className="text-slate-300 text-xs leading-relaxed flex-1">{body}</p>

      {/* Meta */}
      {meta && (
        <p className="text-[10px] font-mono text-slate-600 border-t border-white/5 pt-2">{meta}</p>
      )}
    </div>
  );
}
