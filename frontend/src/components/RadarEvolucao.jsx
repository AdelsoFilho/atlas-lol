import { useMemo } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { TrendingUp } from "lucide-react";

// =============================================================================
// RadarEvolucao.jsx — Spider Chart de evolução de performance
//
// Compara as últimas N/2 partidas com as N/2 anteriores.
// Não faz chamadas de API — recebe matches como prop do App.
//
// Props:
//   matches {Array} — recentMatches do jogador
// =============================================================================

// Máximos de referência para normalização 0-100
const MAX = {
  vision:      2.0,   // visionScore/min  — 2.0 é excelente
  cs:          9.0,   // CS/min           — 9.0+ é top 1%
  kda:         7.0,   // KDA              — 7.0+ é excepcional
  kp:          85,    // kill participation %
  survival:    8,     // mortes/jogo (invertido: 0 mortes = 100 pts)
};

const LABELS = {
  vision:   "Visão",
  cs:       "CS/min",
  kda:      "KDA",
  kp:       "Participação",
  survival: "Sobrevivência",
};

function normalize(value, max, invert = false) {
  if (value == null) return 0;
  const pct = Math.min(100, Math.round((value / max) * 100));
  return invert ? Math.max(0, 100 - pct) : pct;
}

function calcMetrics(slice) {
  if (!slice || slice.length === 0) return null;

  const avg = (fn) => {
    const vals = slice.map(fn).filter(v => v != null && !isNaN(v));
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };

  const vpm  = avg(m => m.durationMin > 0 && m.analysis?.visionScore != null
    ? m.analysis.visionScore / m.durationMin
    : null);
  const cs   = avg(m => m.analysis?.csPerMin   ?? null);
  const kda  = avg(m => m.kda                  ?? null);
  const kp   = avg(m => m.analysis?.killParticipation ?? null);
  const dth  = avg(m => m.deaths               ?? null);

  return {
    vision:   normalize(vpm,  MAX.vision),
    cs:       normalize(cs,   MAX.cs),
    kda:      normalize(kda,  MAX.kda),
    kp:       normalize(kp,   MAX.kp),
    survival: dth != null ? Math.max(0, 100 - Math.round((dth / MAX.survival) * 100)) : 0,
    // raws for tooltip
    _raw: { vpm, cs, kda, kp, dth },
  };
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-800 border border-white/10 rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-white font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}</span>/100
        </p>
      ))}
    </div>
  );
};

export default function RadarEvolucao({ matches }) {
  const { data, recentLabel, prevLabel, hasEnough } = useMemo(() => {
    if (!Array.isArray(matches) || matches.length < 4) {
      return { data: null, recentLabel: "", prevLabel: "", hasEnough: false };
    }

    const mid    = Math.ceil(matches.length / 2);
    const recent = matches.slice(0, mid);
    const prev   = matches.slice(mid);

    const rMet = calcMetrics(recent);
    const pMet = calcMetrics(prev);

    if (!rMet) return { data: null, hasEnough: false };

    const keys   = ["vision", "cs", "kda", "kp", "survival"];
    const radarData = keys.map(k => ({
      metric:   LABELS[k],
      Recente:  rMet[k]  ?? 0,
      Anterior: pMet?.[k] ?? 0,
    }));

    return {
      data:        radarData,
      recentLabel: `Recentes (${recent.length})`,
      prevLabel:   `Anteriores (${prev.length})`,
      hasEnough:   true,
    };
  }, [matches]);

  if (!hasEnough) {
    return (
      <div className="card flex items-center justify-center py-10 text-gray-500 text-sm">
        Mínimo de 4 partidas para exibir o gráfico de evolução.
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp size={15} className="text-blue-400" />
        <h3 className="font-semibold text-white">Evolução de Performance</h3>
        <span className="ml-auto text-xs text-gray-600">Recentes vs Anteriores</span>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
          <PolarGrid stroke="#334155" strokeDasharray="3 3" />
          <PolarAngleAxis
            dataKey="metric"
            tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 500 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: "#475569", fontSize: 9 }}
            tickCount={4}
          />
          <Radar
            name={recentLabel}
            dataKey="Recente"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.25}
            strokeWidth={2}
          />
          <Radar
            name={prevLabel}
            dataKey="Anterior"
            stroke="#64748b"
            fill="#64748b"
            fillOpacity={0.15}
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
          <Legend
            wrapperStyle={{ fontSize: "11px", color: "#94a3b8", paddingTop: "8px" }}
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>

      <p className="text-gray-600 text-xs text-center">
        Valores normalizados 0–100. Azul = partidas recentes · Cinza tracejado = partidas anteriores.
      </p>
    </div>
  );
}
