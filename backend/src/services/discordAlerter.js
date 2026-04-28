"use strict";

// =============================================================================
// discordAlerter.js — Motor de Alertas via Discord Webhook
//
// Envia Discord Embeds ricos para webhooks configurados pelo usuário.
//
// Rate limiting seguro:
//   · Máximo 1 mensagem a cada 10s por canal (evita 429 do Discord)
//   · Fila automática — alertas em excesso são agendados, não descartados
//   · Retry automático em caso de throttle do Discord
//
// Nunca bloqueia a thread principal:
//   · scheduleAlert() retorna imediatamente (fire-and-forget)
//   · Erros são apenas logados, nunca propagados
// =============================================================================

const axios = require("axios");

// ── Rate limit queue ──────────────────────────────────────────────────────────
// webhookUrl → { lastSent: ms, queue: [payload, ...] }
const RATE_QUEUE   = new Map();
const MIN_INTERVAL = 10_000; // 10s entre mensagens por canal (conservador)

// ── Cores Discord (decimal) ───────────────────────────────────────────────────
const COLOR = {
  DANGER:      0xEF4444, // vermelho  — CRITICAL / HIGH
  WARNING:     0xF97316, // laranja   — HIGH / MEDIUM
  OPPORTUNITY: 0x10B981, // verde     — oportunidade de objetivo
  INFO:        0x3B82F6, // azul      — informativo
  SUCCESS:     0x22C55E, // verde vivo — teste bem-sucedido
  NEUTRAL:     0x6B7280, // cinza     — LOW
};

// ── Mapeamento de tipo → label PT-BR ─────────────────────────────────────────
const TYPE_LABEL = {
  LEVEL_SPIKE:        "PICO DE NÍVEL",
  LEVEL_ALERT:        "ALERTA DE NÍVEL",
  ITEM_WINDOW:        "JANELA DE ITEM",
  ITEM_SPIKE:         "POWER SPIKE DETECTADO",
  COMP_WARNING:       "ALERTA DE COMPOSIÇÃO",
  GENERAL:            "DICA DE COUNTERPLAY",
  FIRST_BLOOD_WINDOW: "JANELA DE PRIMEIRO SANGUE",
  OBJECTIVE_WINDOW:   "OBJETIVO PRÓXIMO",
};

// ── Cor e emoji por prioridade ────────────────────────────────────────────────
function alertMeta(priority) {
  return {
    CRITICAL: { color: COLOR.DANGER,      emoji: "🚨" },
    HIGH:     { color: COLOR.WARNING,     emoji: "⚠️"  },
    MEDIUM:   { color: COLOR.OPPORTUNITY, emoji: "💡"  },
    LOW:      { color: COLOR.INFO,        emoji: "ℹ️"  },
  }[priority] ?? { color: COLOR.NEUTRAL, emoji: "📊" };
}

// ── Enriquecimento acionável da descrição ─────────────────────────────────────
// Regra: nunca mandar dados brutos. Mandar SOLUÇÃO.
function enrichDescription(alert) {
  const base = alert.advice ?? "";

  const actions = {
    LEVEL_SPIKE:        "📍 **Ação:** Recue para torre até o Ultimate inimigo ser usado ou expirar.",
    ITEM_WINDOW:        "📍 **Ação:** Verifique quem está à frente em itens antes de qualquer engage.",
    COMP_WARNING:       "📍 **Ação:** Compre item de tenacidade/defesa e ajuste posicionamento.",
    GENERAL:            "📍 **Lembre-se** disso na próxima troca de dano ou teamfight.",
    FIRST_BLOOD_WINDOW: "📍 **Ação:** Ative wards nas entradas da sua rota agora.",
    OBJECTIVE_WINDOW:   "📍 **Ação:** Agrupe com o time antes do objetivo nascer.",
  };

  const suffix = actions[alert.type] ?? "";
  return suffix ? `${base}\n\n> ${suffix}` : base;
}

// ── Construtor de embed Discord ───────────────────────────────────────────────
function buildEmbed(alert, gameTime, summonerName) {
  const { color, emoji } = alertMeta(alert.priority);
  const label = TYPE_LABEL[alert.type] ?? "ALERTA";

  const title = (alert.target && alert.target !== "Ambos os Times" && alert.target !== "Todos")
    ? `${emoji} ${label} — ${alert.target}`
    : `${emoji} ${label}`;

  return {
    embeds: [{
      color,
      title,
      description: enrichDescription(alert),
      footer: {
        text: `Atlas LoL Coach · ${summonerName ?? "Atlas"} · ⏱ ${gameTime ?? "??:??"}`,
      },
      timestamp: new Date().toISOString(),
    }],
  };
}

// ── HTTP POST direto ao webhook Discord ──────────────────────────────────────
async function postToDiscord(webhookUrl, payload) {
  const res = await axios.post(webhookUrl, payload, {
    headers:        { "Content-Type": "application/json" },
    timeout:        8_000,
    validateStatus: s => s < 500, // deixa 4xx passar para tratamento abaixo
  });

  if (res.status === 429) {
    const retryAfter = res.data?.retry_after ?? 5;
    const err = new Error(`Discord rate limit — retry in ${retryAfter}s`);
    err.retryAfter = retryAfter;
    throw err;
  }
  if (res.status >= 400) {
    throw new Error(`Discord rejeitou webhook [${res.status}]: ${JSON.stringify(res.data)}`);
  }
}

// ── Flush da fila (recursivo, agendado) ───────────────────────────────────────
async function flushQueue(webhookUrl) {
  const entry = RATE_QUEUE.get(webhookUrl);
  if (!entry || entry.queue.length === 0) return;

  const payload = entry.queue.shift();
  try {
    await postToDiscord(webhookUrl, payload);
    entry.lastSent = Date.now();
    console.log(`[discordAlerter] ✓ Flushed — fila restante: ${entry.queue.length}`);
  } catch (err) {
    const delay = (err.retryAfter ?? 5) * 1000;
    console.warn(`[discordAlerter] Flush falhou, reagendando em ${delay}ms: ${err.message}`);
    entry.queue.unshift(payload); // recoloca na frente
    RATE_QUEUE.set(webhookUrl, entry);
    setTimeout(() => flushQueue(webhookUrl), delay);
    return;
  }

  RATE_QUEUE.set(webhookUrl, entry);

  if (entry.queue.length > 0) {
    setTimeout(() => flushQueue(webhookUrl), MIN_INTERVAL);
  }
}

// ── Agendador principal (fire-and-forget com rate limit) ──────────────────────
function scheduleAlert(webhookUrl, payload) {
  if (!webhookUrl) return;

  const now   = Date.now();
  const entry = RATE_QUEUE.get(webhookUrl) ?? { lastSent: 0, queue: [] };
  const wait  = Math.max(0, MIN_INTERVAL - (now - entry.lastSent));

  if (wait === 0 && entry.queue.length === 0) {
    // Envia imediatamente (fire-and-forget)
    entry.lastSent = now;
    RATE_QUEUE.set(webhookUrl, entry);

    postToDiscord(webhookUrl, payload).then(() => {
      entry.lastSent = Date.now();
      RATE_QUEUE.set(webhookUrl, entry);
      console.log(`[discordAlerter] ✓ Enviado imediatamente`);
    }).catch(err => {
      const delay = (err.retryAfter ?? 5) * 1000;
      console.warn(`[discordAlerter] Envio falhou, enfileirando: ${err.message}`);
      entry.queue.push(payload);
      RATE_QUEUE.set(webhookUrl, entry);
      setTimeout(() => flushQueue(webhookUrl), delay);
    });
  } else {
    // Enfileira
    entry.queue.push(payload);
    RATE_QUEUE.set(webhookUrl, entry);
    if (entry.queue.length === 1) {
      setTimeout(() => flushQueue(webhookUrl), wait || MIN_INTERVAL);
    }
    console.log(`[discordAlerter] Enfileirado (${entry.queue.length} na fila, aguardando ${Math.round((wait || MIN_INTERVAL) / 1000)}s)`);
  }
}

// ── Filtragem por preferências do usuário ────────────────────────────────────
function matchesPrefs(alertType, prefs) {
  if (!prefs) return true;
  const map = {
    LEVEL_SPIKE:        prefs.levelAlerts,
    LEVEL_ALERT:        prefs.levelAlerts,
    ITEM_WINDOW:        prefs.powerSpike,
    ITEM_SPIKE:         prefs.powerSpike,
    COMP_WARNING:       prefs.counterplay,
    GENERAL:            prefs.counterplay,
    FIRST_BLOOD_WINDOW: prefs.objectives,
    OBJECTIVE_WINDOW:   prefs.objectives,
  };
  // undefined → true (default to show)
  return map[alertType] !== false;
}

// ── Dispatcher principal ───────────────────────────────────────────────────────
/**
 * Processa dados do War Room e enfileira alertas para o Discord.
 *
 * Filtros aplicados:
 *   1. Apenas alertas HIGH ou CRITICAL dos counterStrategies
 *   2. Apenas tipos habilitados nas prefs do usuário
 *   3. Live events de todos os tipos (nível e item)
 *
 * @param {object} warRoomData   — resultado de getWarRoom() ou getSimulatedWarRoom()
 * @param {string} webhookUrl    — URL completa do Discord webhook
 * @param {object} prefs         — { powerSpike, levelAlerts, objectives, counterplay }
 * @param {string} summonerName  — "Nome#TAG" para o footer
 * @returns {number} quantidade de alertas enfileirados
 */
function dispatchWarRoomAlerts(warRoomData, webhookUrl, prefs, summonerName) {
  if (!webhookUrl || !warRoomData?.isLive) return 0;

  const gameTime = warRoomData.gameTime ?? "??:??";
  let count = 0;

  // ── Counter tips HIGH/CRITICAL ────────────────────────────────────────────
  for (const tip of warRoomData.counterStrategies ?? []) {
    if (!["CRITICAL", "HIGH"].includes(tip.priority)) continue;
    if (!matchesPrefs(tip.type, prefs)) continue;

    scheduleAlert(webhookUrl, buildEmbed(tip, gameTime, summonerName));
    count++;
  }

  // ── Live events (novos, gerados neste poll) ───────────────────────────────
  for (const evt of warRoomData.liveEvents ?? []) {
    if (!matchesPrefs(evt.type, prefs)) continue;

    const synthetic = {
      type:     evt.type,
      priority: evt.team === "red" ? "HIGH" : "MEDIUM",
      target:   evt.team === "red" ? "Time Inimigo" : evt.team === "blue" ? "Seu Time" : "Todos",
      advice:   evt.msg,
    };
    scheduleAlert(webhookUrl, buildEmbed(synthetic, gameTime, summonerName));
    count++;
  }

  return count;
}

// ── Alerta de teste ───────────────────────────────────────────────────────────
async function sendTestAlert(webhookUrl) {
  const payload = {
    embeds: [{
      color: COLOR.SUCCESS,
      title: "✅ Atlas LoL Coach — Conectado com Sucesso!",
      description: [
        "Seu webhook está funcionando. Exemplos de alertas que você receberá:",
        "",
        "> 🚨 **POWER SPIKE — Zed** atingiu nível 6.",
        "> Recue para torre até o Ultimate ser usado ou expirar.",
        "",
        "> ⚠️ **ALERTA DE COMPOSIÇÃO — Time Inimigo**",
        "> 3 campeões de CC pesado. Compre Botas de Mercúrio imediatamente.",
        "",
        "> 💡 **DICA DE COUNTERPLAY — Yasuo**",
        "> Segure CC para quando ele usar E — fica vulnerável 0.75s.",
      ].join("\n"),
      fields: [{
        name:   "🔔 Alertas configurados",
        value:  "Power Spike · Nível/Ultimate · Objetivos · Counterplay",
        inline: false,
      }],
      footer:    { text: "Atlas LoL Coach · Configuração validada" },
      timestamp: new Date().toISOString(),
    }],
  };

  await postToDiscord(webhookUrl, payload);
}

module.exports = { sendTestAlert, dispatchWarRoomAlerts, buildEmbed, scheduleAlert };
