import { useMemo } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

// ─── GoldChart ────────────────────────────────────────────────────────────────
// Gráfico SVG de diferença de ouro minuto a minuto.
// Verde acima de zero (equipe na frente), vermelho abaixo (equipe atrás).
// Linha vertical tracejada marca o Tipping Point, se houver.
// ─────────────────────────────────────────────────────────────────────────────

const W = 600;
const H = 200;
const PAD = { top: 20, bottom: 30, left: 52, right: 16 };

const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top  - PAD.bottom;

export default function GoldChart({ goldDiffs, tippingPoint, gameDurationMin }) {
  const { pathPoints, minDiff, maxDiff, yZero, minuteStep } = useMemo(() => {
    if (!goldDiffs?.length) return {};

    const diffs  = goldDiffs.map(g => g.diff);
    const rawMin = Math.min(...diffs);
    const rawMax = Math.max(...diffs);

    // Margem vertical de 10%
    const span   = Math.max(Math.abs(rawMin), Math.abs(rawMax), 500);
    const minDiff = -span;
    const maxDiff =  span;

    const scaleX = (min) => PAD.left + (min / (goldDiffs.length - 1)) * innerW;
    const scaleY = (diff) =>
      PAD.top + ((maxDiff - diff) / (maxDiff - minDiff)) * innerH;

    const pathPoints = goldDiffs.map((g, i) => ({
      x: scaleX(i),
      y: scaleY(g.diff),
    }));

    const yZero = scaleY(0);

    // Espaçamento entre marcadores do eixo X
    const minuteStep = goldDiffs.length > 30 ? 5 : goldDiffs.length > 15 ? 5 : 2;

    return { pathPoints, minDiff, maxDiff, yZero, minuteStep };
  }, [goldDiffs]);

  if (!goldDiffs?.length || !pathPoints) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
        Dados de gold não disponíveis
      </div>
    );
  }

  // Construção do path SVG (linha principal)
  const linePath = pathPoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  // Área verde: clip acima da linha zero
  const areaPath = [
    linePath,
    `L${pathPoints[pathPoints.length - 1].x.toFixed(1)},${yZero.toFixed(1)}`,
    `L${pathPoints[0].x.toFixed(1)},${yZero.toFixed(1)}`,
    "Z",
  ].join(" ");

  // Eixo Y: marcadores a cada 1000 ou 2000 de ouro
  const span = maxDiff - minDiff;
  const step  = span > 8000 ? 2000 : 1000;
  const yTicks = [];
  for (let v = -Math.floor(maxDiff / step) * step; v <= maxDiff; v += step) {
    const y = PAD.top + ((maxDiff - v) / (maxDiff - minDiff)) * innerH;
    yTicks.push({ v, y });
  }

  const tpX = tippingPoint
    ? PAD.left + (tippingPoint.minute / (goldDiffs.length - 1)) * innerW
    : null;

  const lastDiff = goldDiffs[goldDiffs.length - 1]?.diff ?? 0;

  return (
    <div className="space-y-2">
      {/* Legenda */}
      <div className="flex items-center justify-between text-xs text-gray-500 px-1">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-emerald-500/40 border border-emerald-500/60 inline-block" />
          Vantagem
        </span>
        {tippingPoint && (
          <span className="text-orange-400 font-medium">
            ⚡ Virada no min. {tippingPoint.minute}
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-red-500/40 border border-red-500/60 inline-block" />
          Desvantagem
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "180px" }}
      >
        <defs>
          {/* Clip verde: apenas a região acima da linha zero */}
          <clipPath id="clip-pos">
            <rect
              x={PAD.left} y={PAD.top}
              width={innerW} height={yZero - PAD.top}
            />
          </clipPath>
          {/* Clip vermelho: apenas a região abaixo da linha zero */}
          <clipPath id="clip-neg">
            <rect
              x={PAD.left} y={yZero}
              width={innerW} height={PAD.top + innerH - yZero}
            />
          </clipPath>
          {/* Gradiente verde */}
          <linearGradient id="grad-pos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#10b981" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
          </linearGradient>
          {/* Gradiente vermelho */}
          <linearGradient id="grad-neg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#ef4444" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Grade horizontal */}
        {yTicks.map(({ v, y }) => (
          <g key={v}>
            <line
              x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y}
              stroke={v === 0 ? "#4b5563" : "#1f2937"}
              strokeWidth={v === 0 ? 1.5 : 0.75}
              strokeDasharray={v === 0 ? "none" : "4 3"}
            />
            <text
              x={PAD.left - 6} y={y + 4}
              textAnchor="end" fontSize="9" fill="#6b7280"
            >
              {v >= 0 ? `+${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`
                      : `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`}
            </text>
          </g>
        ))}

        {/* Área verde (acima do zero) */}
        <path
          d={areaPath}
          fill="url(#grad-pos)"
          clipPath="url(#clip-pos)"
        />

        {/* Área vermelha (abaixo do zero) */}
        <path
          d={areaPath}
          fill="url(#grad-neg)"
          clipPath="url(#clip-neg)"
        />

        {/* Linha principal */}
        <path
          d={linePath}
          fill="none"
          stroke="#60a5fa"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Linha do Tipping Point */}
        {tpX !== null && (
          <>
            <line
              x1={tpX} y1={PAD.top}
              x2={tpX} y2={PAD.top + innerH}
              stroke="#f97316"
              strokeWidth="1.5"
              strokeDasharray="5 3"
            />
            <text
              x={tpX + 4} y={PAD.top + 11}
              fontSize="9" fill="#f97316"
            >
              min {tippingPoint.minute}
            </text>
          </>
        )}

        {/* Ponto final */}
        <circle
          cx={pathPoints[pathPoints.length - 1].x}
          cy={pathPoints[pathPoints.length - 1].y}
          r="3.5"
          fill={lastDiff >= 0 ? "#10b981" : "#ef4444"}
          stroke="#0f1626"
          strokeWidth="1.5"
        />

        {/* Eixo X — marcadores de minuto */}
        {goldDiffs.map((g, i) => {
          if (i === 0 || i % minuteStep !== 0) return null;
          const x = PAD.left + (i / (goldDiffs.length - 1)) * innerW;
          return (
            <g key={i}>
              <line
                x1={x} y1={PAD.top + innerH}
                x2={x} y2={PAD.top + innerH + 4}
                stroke="#374151" strokeWidth={1}
              />
              <text
                x={x} y={H - 4}
                textAnchor="middle" fontSize="9" fill="#6b7280"
              >
                {i}
              </text>
            </g>
          );
        })}

        {/* Rótulo eixo X */}
        <text
          x={PAD.left + innerW / 2}
          y={H}
          textAnchor="middle" fontSize="9" fill="#4b5563"
        >
          minutos
        </text>
      </svg>

      {/* Diff final */}
      <div className="flex items-center justify-center gap-1.5 text-xs">
        {lastDiff >= 0 ? (
          <span className="flex items-center gap-1 text-emerald-400">
            <TrendingUp size={12} />
            +{Math.abs(lastDiff).toLocaleString("pt-BR")} de ouro no final
          </span>
        ) : (
          <span className="flex items-center gap-1 text-red-400">
            <TrendingDown size={12} />
            -{Math.abs(lastDiff).toLocaleString("pt-BR")} de ouro no final
          </span>
        )}
      </div>
    </div>
  );
}
