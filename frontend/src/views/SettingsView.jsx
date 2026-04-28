import { useState } from "react";
import { Settings, Globe, Info, Shield, ChevronRight, CheckCircle2, Database } from "lucide-react";

// =============================================================================
// SettingsView — Configurações da aplicação
// =============================================================================

const REGIONS = [
  { id: "br1",   label: "Brasil (BR1)"        },
  { id: "na1",   label: "América do Norte (NA1)" },
  { id: "euw1",  label: "Europa Oeste (EUW1)"  },
  { id: "eun1",  label: "Europa NE (EUN1)"     },
  { id: "kr",    label: "Coreia (KR)"          },
  { id: "la1",   label: "LAN (LA1)"            },
  { id: "la2",   label: "LAS (LA2)"            },
  { id: "oc1",   label: "Oceania (OC1)"        },
  { id: "tr1",   label: "Turquia (TR1)"        },
  { id: "jp1",   label: "Japão (JP1)"          },
];

export default function SettingsView() {
  const [region,  setRegion]  = useState("br1");
  const [saved,   setSaved]   = useState(false);

  function save() {
    // Em produção, essa configuração afetaria o RIOT_PLATFORM env var via restart
    // Por ora, é um placeholder visual / future feature
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="px-8 py-8 space-y-8 max-w-2xl animate-fade-up">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings size={20} className="text-electric" />
        <div>
          <h1 className="text-xl font-bold text-white">Configurações</h1>
          <p className="text-slate-500 text-xs font-mono mt-0.5">Preferências da plataforma</p>
        </div>
      </div>

      {/* Region */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-electric" />
          <p className="text-sm font-semibold text-white">Região de Análise</p>
        </div>
        <p className="text-slate-500 text-xs leading-relaxed">
          A região determina qual servidor da Riot API é consultado.
          Ao mudar, o servidor precisa ser reiniciado com a variável{" "}
          <code className="text-electric bg-electric/10 px-1 py-0.5 rounded font-mono text-[10px]">
            RIOT_PLATFORM
          </code>.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {REGIONS.map(r => (
            <button
              key={r.id}
              onClick={() => setRegion(r.id)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl border
                          text-sm transition-all ${
                region === r.id
                  ? "bg-electric/10 border-electric/40 text-electric"
                  : "border-white/8 text-slate-400 hover:border-white/15 hover:text-slate-200"
              }`}
            >
              <span>{r.label}</span>
              {region === r.id && <CheckCircle2 size={13} className="text-electric" />}
            </button>
          ))}
        </div>
        <button
          onClick={save}
          className={`btn-primary w-full flex items-center justify-center gap-2 ${
            saved ? "bg-emerald-900/30 border-emerald-700/50 text-emerald-400" : ""
          }`}
        >
          {saved ? <><CheckCircle2 size={14} />Configuração salva!</> : "Salvar Preferências"}
        </button>
      </div>

      {/* Cache info */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-electric" />
          <p className="text-sm font-semibold text-white">Cache do Servidor</p>
        </div>
        <p className="text-slate-500 text-xs leading-relaxed">
          O Atlas usa cache em memória para evitar chamadas redundantes à Riot API.<br />
          Partidas: TTL 15min · Timeline: TTL 15min · Jogador: TTL 15min · IA: TTL 1h
        </p>
        <a
          href="/health"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-electric/70 hover:text-electric
                     transition-colors font-mono"
        >
          Ver status do servidor (health check) <ChevronRight size={12} />
        </a>
      </div>

      {/* About */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <Info size={14} className="text-electric" />
          <p className="text-sm font-semibold text-white">Sobre o Atlas</p>
        </div>
        <p className="text-slate-500 text-xs leading-relaxed">
          Atlas LoL é uma plataforma de análise pós-game e pré-game construída com
          Node.js/Express no backend e React/Vite no frontend. Utiliza a Riot API Match-v5
          para dados históricos e Groq LLaMA 3 para coaching com IA.
        </p>
        <div className="flex flex-wrap gap-2">
          {["React 18", "Vite", "Node.js", "Riot API v5", "Tailwind CSS", "Recharts"].map(t => (
            <span key={t} className="tag-cyan">{t}</span>
          ))}
        </div>
        <p className="text-[10px] text-slate-700 font-mono mt-2">
          Atlas LoL não é afiliado à Riot Games. Dados fornecidos pela API pública da Riot.
        </p>
      </div>
    </div>
  );
}
