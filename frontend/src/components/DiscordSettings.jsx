import { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  X, Bell, BellOff, AlertCircle, CheckCircle2,
  Loader2, ChevronDown, ChevronRight, Send, Zap,
} from "lucide-react";

// =============================================================================
// DiscordSettings.jsx — Discord Command Center
//
// Configura alertas proativos via Discord Webhook.
// Persiste webhook URL e preferências no localStorage.
//
// Quando "Alertas ao Vivo" está ativo + riotId disponível:
//   → Chama POST /api/discord/trigger/:riotId a cada 180s (mesma janela do poll)
//   → Alertas chegam no Discord durante a partida sem o jogador olhar o dashboard
//
// Props:
//   riotId   {string|null}  — "Nome#TAG" do jogador atual (null = sem jogador)
//   isOpen   {boolean}
//   onClose  {function}
// =============================================================================

const LS_WEBHOOK = "atlas_discord_webhook";
const LS_PREFS   = "atlas_discord_prefs";
const LS_ENABLED = "atlas_discord_enabled";
const POLL_MS    = 180_000;

const DEFAULT_PREFS = {
  powerSpike:  true,
  levelAlerts: true,
  objectives:  true,
  counterplay: true,
};

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none shrink-0 ${
        checked ? "bg-indigo-600" : "bg-gray-700"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow
                    transition-transform duration-200 ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function DiscordSettings({ riotId, isOpen, onClose }) {
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem(LS_WEBHOOK) ?? "");
  const [prefs,      setPrefs]      = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_PREFS) ?? "null") ?? DEFAULT_PREFS; }
    catch { return DEFAULT_PREFS; }
  });
  const [enabled,    setEnabled]    = useState(() => localStorage.getItem(LS_ENABLED) === "true");

  const [testState,  setTestState]  = useState("idle"); // idle|loading|ok|error
  const [testMsg,    setTestMsg]    = useState("");
  const [howtoOpen,  setHowtoOpen]  = useState(false);

  // Trigger state (Discord polling independente da UI)
  const [lastSent,   setLastSent]   = useState(null);
  const [sending,    setSending]    = useState(false);

  const pollRef = useRef(null);

  // Persist
  useEffect(() => { localStorage.setItem(LS_WEBHOOK, webhookUrl); }, [webhookUrl]);
  useEffect(() => { localStorage.setItem(LS_PREFS,   JSON.stringify(prefs)); }, [prefs]);
  useEffect(() => { localStorage.setItem(LS_ENABLED, String(enabled)); }, [enabled]);

  // ── Polling de alertas (independente do modal estar aberto) ───────────────
  useEffect(() => {
    clearInterval(pollRef.current);
    if (!enabled || !riotId || !webhookUrl) return;

    const run = () => triggerAlerts(riotId, webhookUrl, prefs);
    run(); // disparo imediato
    pollRef.current = setInterval(run, POLL_MS);
    return () => clearInterval(pollRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, riotId, webhookUrl]);

  // Restartar polling quando prefs mudam (mantém configuração atualizada)
  useEffect(() => {
    if (!enabled || !riotId || !webhookUrl) return;
    clearInterval(pollRef.current);
    pollRef.current = setInterval(() => triggerAlerts(riotId, webhookUrl, prefs), POLL_MS);
    return () => clearInterval(pollRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]);

  // ── Test webhook ──────────────────────────────────────────────────────────
  async function handleTest() {
    if (!webhookUrl.trim()) {
      setTestState("error");
      setTestMsg("Cole a URL do webhook antes de testar.");
      return;
    }
    if (!webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
      setTestState("error");
      setTestMsg("URL inválida. Deve começar com https://discord.com/api/webhooks/");
      return;
    }
    setTestState("loading");
    setTestMsg("");
    try {
      await axios.post("/api/discord/test", { webhookUrl });
      setTestState("ok");
      setTestMsg("Alerta enviado! Verifique o canal do Discord.");
    } catch (err) {
      setTestState("error");
      setTestMsg(err.response?.data?.error ?? "Falha ao enviar. Verifique a URL do webhook.");
    }
    setTimeout(() => setTestState("idle"), 6000);
  }

  // ── Trigger de alerta imediato ────────────────────────────────────────────
  async function triggerAlerts(id, url, p) {
    if (!id || !url) return;
    setSending(true);
    try {
      await axios.post(`/api/discord/trigger/${encodeURIComponent(id)}`, {
        webhookUrl: url,
        prefs:      p,
      });
      setLastSent(new Date());
    } catch {
      // Falha silenciosa — log no servidor, não quebra a UI
    } finally {
      setSending(false);
    }
  }

  function togglePref(key) {
    setPrefs(p => ({ ...p, [key]: !p[key] }));
  }

  // ── O componente deve estar sempre montado (polling independente) ──────────
  // isOpen controla apenas a visibilidade
  if (!isOpen) return null;

  const isConnected = testState === "ok";
  const hasRiotId   = Boolean(riotId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4
                 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-800 border border-white/10 rounded-3xl w-full max-w-sm
                      shadow-2xl space-y-5 p-5 max-h-[90vh] overflow-y-auto">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-600/30
                            flex items-center justify-center">
              <Bell size={14} className="text-indigo-400" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm leading-none">Discord Command Center</p>
              <p className="text-gray-600 text-xs mt-0.5">Alertas em tempo real para o seu canal</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
            <X size={15} />
          </button>
        </div>

        {/* ── Master toggle ───────────────────────────────────────────────── */}
        <div className={`flex items-center justify-between rounded-2xl px-4 py-3.5 border transition-colors ${
          enabled
            ? "bg-indigo-900/20 border-indigo-700/30"
            : "bg-surface-700 border-white/5"
        }`}>
          <div className="flex items-center gap-2.5">
            {enabled
              ? <Bell    size={14} className="text-indigo-400 shrink-0" />
              : <BellOff size={14} className="text-gray-600  shrink-0" />}
            <div>
              <p className="text-sm font-semibold text-white">Alertas ao Vivo</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {enabled
                  ? hasRiotId
                    ? `Monitorando ${riotId} · atualiza a cada 3 min`
                    : "Aguardando busca de jogador"
                  : "Ative para receber alertas durante a partida"}
              </p>
            </div>
          </div>
          <Toggle checked={enabled} onChange={setEnabled} />
        </div>

        {/* Aviso sem riotId */}
        {enabled && !hasRiotId && (
          <div className="flex items-start gap-2 text-yellow-400 text-xs bg-yellow-900/15
                          border border-yellow-700/25 rounded-xl px-3 py-2.5">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            Busque um jogador no Atlas para começar o monitoramento.
          </div>
        )}

        {/* ── Webhook URL ─────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Webhook URL do Discord
          </label>
          <input
            value={webhookUrl}
            onChange={e => { setWebhookUrl(e.target.value); setTestState("idle"); }}
            placeholder="https://discord.com/api/webhooks/..."
            className="w-full bg-surface-700 border border-white/10 rounded-xl px-3 py-2.5
                       text-xs text-gray-200 placeholder-gray-700 focus:outline-none
                       focus:border-indigo-500/70 font-mono transition-colors"
          />

          {/* Test button */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleTest}
              disabled={testState === "loading" || !webhookUrl.trim()}
              className="flex items-center gap-1.5 text-xs font-semibold
                         bg-indigo-600/20 border border-indigo-600/40 text-indigo-300
                         hover:bg-indigo-600/30 rounded-xl px-3 py-1.5 transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {testState === "loading"
                ? <Loader2 size={11} className="animate-spin" />
                : <Send size={11} />}
              Testar Webhook
            </button>

            {testState === "ok" && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 size={11} />Conectado!
              </span>
            )}
            {testState === "error" && (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <AlertCircle size={11} />Erro
              </span>
            )}
          </div>
          {testMsg && (
            <p className={`text-xs leading-relaxed ${
              testState === "ok" ? "text-emerald-500" : "text-red-400"
            }`}>
              {testMsg}
            </p>
          )}
        </div>

        {/* ── Alert type toggles ───────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Tipos de Alerta
          </p>
          <div className="bg-surface-700 rounded-2xl border border-white/5 divide-y divide-white/5">
            {[
              {
                key:   "powerSpike",
                label: "Power Spike — Itens",
                desc:  "Janelas de item e picos de damage",
                icon:  <Zap size={11} className="text-yellow-400" />,
              },
              {
                key:   "levelAlerts",
                label: "Nível / Ultimates",
                desc:  "Alertas nos níveis 6, 11 e 16",
                icon:  <span className="text-orange-400 text-[10px] font-black">16</span>,
              },
              {
                key:   "objectives",
                label: "Objetivos",
                desc:  "Barão, Dragão, first blood",
                icon:  <span className="text-emerald-400 text-xs">🐉</span>,
              },
              {
                key:   "counterplay",
                label: "Counterplay",
                desc:  "Composição e dicas de counter",
                icon:  <span className="text-blue-400 text-xs">🛡️</span>,
              },
            ].map(({ key, label, desc, icon }) => (
              <div key={key} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="shrink-0 w-4 flex items-center justify-center">{icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium leading-none">{label}</p>
                    <p className="text-xs text-gray-600 mt-0.5 truncate">{desc}</p>
                  </div>
                </div>
                <Toggle
                  checked={prefs[key] !== false}
                  onChange={v => setPrefs(p => ({ ...p, [key]: v }))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Status / último envio ────────────────────────────────────────── */}
        {(lastSent || sending) && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            {sending
              ? <><Loader2 size={11} className="animate-spin text-indigo-400" /> Enviando alertas…</>
              : lastSent
                ? <><CheckCircle2 size={11} className="text-emerald-600" /> Último envio: {lastSent.toLocaleTimeString("pt-BR")}</>
                : null}
          </div>
        )}

        {/* ── How-to guide ─────────────────────────────────────────────────── */}
        <div>
          <button
            onClick={() => setHowtoOpen(o => !o)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300
                       transition-colors w-full py-1"
          >
            {howtoOpen
              ? <ChevronDown  size={12} />
              : <ChevronRight size={12} />}
            Como criar um Webhook no Discord?
          </button>

          {howtoOpen && (
            <div className="mt-2.5 pl-4 border-l-2 border-indigo-700/30">
              <ol className="space-y-2 text-xs text-gray-400">
                {[
                  <>Abra o Discord e vá ao <strong className="text-gray-200">canal desejado</strong></>,
                  <>Clique na ⚙️ engrenagem do canal → <strong className="text-gray-200">Integrações</strong></>,
                  <>Clique em <strong className="text-gray-200">Webhooks → Novo Webhook</strong></>,
                  <>Dê um nome (ex: <em className="text-indigo-300">"Atlas LoL Coach"</em>)</>,
                  <>Clique em <strong className="text-gray-200">Copiar URL do Webhook</strong></>,
                  <>Cole aqui acima e clique em <strong className="text-gray-200">"Testar Webhook"</strong></>,
                ].map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-indigo-500 font-bold shrink-0">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* ── Aviso de segurança ───────────────────────────────────────────── */}
        <p className="text-[10px] text-gray-700 text-center leading-relaxed">
          A URL do webhook é salva apenas no seu navegador (localStorage).<br />
          Nunca é enviada para terceiros além do Discord.
        </p>
      </div>
    </div>
  );
}
