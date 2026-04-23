// =============================================================================
// aiCoach.js — Cliente Groq (LLaMA 3.3 70B) para análise de partidas
//
// Modelo  : llama-3.3-70b-versatile
// Temp.   : 0.2  (mínimo de criatividade — análise puramente factual)
// Saída   : JSON nativo via response_format: { type: "json_object" }
// Retry   : Exponential backoff (até 5 tentativas) para 429s da Groq
// =============================================================================

"use strict";

const Groq = require("groq-sdk");

// ── System Prompt ─────────────────────────────────────────────────────────────
// Instruções rigorosas para eliminar alucinações e garantir JSON puro.
const SYSTEM_PROMPT = `\
Você é um sistema de análise estatística de League of Legends nível Challenger.

═══════════════════════════════════════════════════
REGRA #1 — ÚNICA FONTE DA VERDADE PARA O RESULTADO
═══════════════════════════════════════════════════
O campo "playerSummary.result" do JSON de entrada é a ÚNICA fonte válida para determinar o resultado da partida.
- SE "result" for "VITÓRIA": a partida terminou em VITÓRIA. PONTO FINAL.
- SE "result" for "DERROTA": a partida terminou em DERROTA. PONTO FINAL.

PROIBIDO inferir o resultado a partir de qualquer outra estatística (deaths, gold diff, KDA).
PROIBIDO escrever "Derrota" ou "perda" se "result" for "VITÓRIA".
PROIBIDO escrever "Vitória" se "result" for "DERROTA".
Violar esta regra é um erro crítico de análise.

═══════════════════════════════════
REGRA #2 — NARRATIVA CONDICIONADA AO RESULTADO
═══════════════════════════════════
A análise deve ser enquadrada SEMPRE dentro do contexto do resultado real:

SE VITÓRIA (result = "VITÓRIA"):
  - O foco é nos ERROS QUE QUASE CUSTARAM A VITÓRIA, não em "por que perdeu".
  - Deaths altas em uma vitória = jogo agressivo com risco desnecessário, não derrota.
  - Gold diff negativo momentâneo em uma vitória = pressão sofrida que foi superada.
  - "criticalMoment" deve descrever o momento em que a vitória foi mais ameaçada.
  - Exemplos corretos de "mainIssue" para vitória:
      ✅ "Vitória sofrida — 11 mortes expuseram o time a counter-attacks desnecessários"
      ✅ "Apesar da vitória, déficit de gold @15 indica rota fraca que poderia ter custado o jogo"
      ✅ "Vitória conquistada via macro mesmo com KDA negativo — padrão insustentável em elos mais altos"
  - Exemplos PROIBIDOS para vitória:
      ❌ "Derrota causada por 11 mortes"
      ❌ "O jogador foi derrotado na rota"
      ❌ qualquer uso de "derrota", "perdeu", "foi eliminado" como resultado final

SE DERROTA (result = "DERROTA"):
  - O foco é na CAUSA-RAIZ que levou à derrota.
  - Conecte mortes à perda de objetivos quando há evidência direta nos dados.
  - Gold diff negativo é sintoma; a causa é o que gerou esse diff.

═══════════════════════════════════
REGRAS ABSOLUTAS DE FORMATO
═══════════════════════════════════
- Retorne APENAS o objeto JSON. NENHUM texto antes ou depois.
- NÃO use markdown (proibido: \`\`\`json, \`\`\`, asteriscos, hifens de lista).
- NÃO escreva frases introdutórias como "Aqui está a análise" ou "Com base nos dados".
- NÃO alucine dados. Use SOMENTE o que está no JSON de entrada.

═══════════════════════════════════
CRITÉRIOS DE ANÁLISE (ordem de prioridade)
═══════════════════════════════════
1. Leia "result" primeiro. Enquadre TUDO a partir daí.
2. Conecte mortes à perda/ameaça de objetivos quando há causalidade direta nos dados.
3. Use goldDiffAt15 para separar "erro individual de rota" de "erro macro do time".
4. Analise o power spike: mortes precoces em campeões late-game (Nasus, Kayle, Kassadin) são mais graves.
5. Se ganhou a rota (goldDiffAt15 positivo) mas o time perdeu: o problema é macro, não individual.

═══════════════════════════════════
SAÍDA OBRIGATÓRIA
═══════════════════════════════════
Retorne exatamente este objeto JSON (sem campos extras, sem omitir campos):
{
  "mainIssue": "<1 frase começando com 'Vitória — ' ou 'Derrota — ' seguido da causa-raiz específica>",
  "detailedAnalysis": "<2-4 frases enquadrando os dados dentro do resultado real>",
  "actionableTips": ["<dica mensurável 1>", "<dica mensurável 2>", "<dica mensurável 3>"],
  "criticalMoment": { "minute": <número inteiro>, "reason": "<o que aconteceu neste minuto>" }
}

RESTRIÇÕES FINAIS:
- "mainIssue": DEVE começar com "Vitória — " se result=VITÓRIA, ou "Derrota — " se result=DERROTA.
- "actionableTips": exatamente 3 itens com métricas concretas (ex: "Reduza para no máximo 6 mortes por partida").
- "criticalMoment.minute": use tippingPoint.minute do JSON se disponível; senão, o minuto do evento mais impactante.`;

// ── Configuração ──────────────────────────────────────────────────────────────

const MODEL   = "llama-3.3-70b-versatile";
const MAX_RETRIES = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRateLimitError(err) {
  const msg    = String(err?.message ?? "").toLowerCase();
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  return status === 429
    || msg.includes("429")
    || msg.includes("rate_limit")
    || msg.includes("rate limit")
    || msg.includes("too many requests");
}

// Remove markdown defensivo mesmo com response_format: json_object
function parseJsonSafe(text) {
  const stripped = text
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  return JSON.parse(stripped);
}

function validateSchema(obj) {
  if (typeof obj.mainIssue        !== "string") throw new Error("Campo mainIssue inválido");
  if (typeof obj.detailedAnalysis !== "string") throw new Error("Campo detailedAnalysis inválido");
  if (!Array.isArray(obj.actionableTips))       throw new Error("Campo actionableTips inválido");
  if (typeof obj.criticalMoment   !== "object"
    || obj.criticalMoment === null)             throw new Error("Campo criticalMoment inválido");
  if (typeof obj.criticalMoment.minute !== "number") throw new Error("criticalMoment.minute inválido");
  if (typeof obj.criticalMoment.reason !== "string") throw new Error("criticalMoment.reason inválido");
}

// ── Função principal ──────────────────────────────────────────────────────────

/**
 * Envia o payload sintetizado à Groq e retorna análise estruturada.
 * Exportado como `analyzeWithGemini` para manter compatibilidade com index.js.
 *
 * @param {object} synthesizedData  Saída de dataSynthesizer.synthesize()
 * @returns {Promise<{ mainIssue, detailedAnalysis, actionableTips, criticalMoment }>}
 */
async function analyzeWithGemini(synthesizedData) {
  const apiKey = process.env.GROQ_API_KEY;

  // Guarda contra chave errada (ex: usuário deixou a do Google)
  if (!apiKey) {
    const e    = new Error("GROQ_API_KEY não configurada no servidor.");
    e.status   = 503;
    e.friendly = "Análise de IA não configurada. Adicione GROQ_API_KEY ao .env do servidor.";
    throw e;
  }
  if (apiKey.startsWith("AIza")) {
    const e    = new Error("GROQ_API_KEY contém uma chave do Google (AIza…). Configure a chave correta da Groq em GROQ_API_KEY.");
    e.status   = 503;
    e.friendly = "Chave de API incorreta: você configurou uma chave do Google onde deveria estar a chave da Groq. Corrija o .env.";
    throw e;
  }

  const groq = new Groq({ apiKey });

  const userMessage = [
    "Analise os dados da partida abaixo e retorne o JSON conforme as instruções do sistema.",
    "",
    JSON.stringify(synthesizedData, null, 2),
  ].join("\n");

  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model:           MODEL,
        temperature:     0.2,
        max_tokens:      1024,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: userMessage   },
        ],
      });

      const rawText = completion.choices[0]?.message?.content ?? "";
      if (!rawText) throw new Error("Groq retornou resposta vazia.");

      // Parse + validação
      let parsed;
      try {
        parsed = parseJsonSafe(rawText);
        validateSchema(parsed);
      } catch (parseErr) {
        console.error("[aiCoach] Falha ao parsear JSON da Groq:", parseErr.message);
        console.error("[aiCoach] Resposta bruta:", rawText.slice(0, 300));
        const e    = new Error("Resposta da IA em formato inesperado.");
        e.status   = 502;
        e.friendly = "A IA retornou uma resposta em formato inesperado. Tente novamente.";
        e.rawText  = rawText;
        throw e;
      }

      // Normaliza actionableTips
      parsed.actionableTips = (parsed.actionableTips ?? []).slice(0, 5).map(String);
      // Garante minute como inteiro
      parsed.criticalMoment.minute = Math.round(Number(parsed.criticalMoment.minute)) || 0;

      return parsed;                                   // ← sucesso

    } catch (err) {
      lastError = err;

      // Erros de parse ou 503 → não retenta (gastar quota sem sentido)
      if (err.status === 502 || err.status === 503) throw err;

      // 429 → backoff exponencial com jitter
      if (isRateLimitError(err) && attempt < MAX_RETRIES - 1) {
        const wait = Math.pow(2, attempt) * 1_000 + Math.random() * 500;
        console.warn(`[aiCoach] 429 na tentativa ${attempt + 1}/${MAX_RETRIES} — aguardando ${Math.round(wait)}ms`);
        await sleep(wait);
        continue;
      }

      // Qualquer outro erro de rede / API
      if (!isRateLimitError(err)) {
        const e    = new Error(`Groq API error: ${err.message}`);
        e.status   = 502;
        e.friendly = "Erro ao comunicar com a IA. Tente novamente em alguns instantes.";
        throw e;
      }
    }
  }

  // Todas as retentativas de 429 esgotadas
  const e    = new Error("RATE_LIMIT_PERSISTENT");
  e.status   = 429;
  e.friendly = "Limite de requisições atingido. Aguarde alguns minutos antes de analisar outra partida.";
  throw e;
}

// Alias semântico (pode usar em futuras refatorações do index.js)
const analyzeWithGroq = analyzeWithGemini;

module.exports = { analyzeWithGemini, analyzeWithGroq };
