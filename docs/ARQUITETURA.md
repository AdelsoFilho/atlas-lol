# Atlas LoL — Arquitetura do Sistema

## Visão Geral

O Atlas LoL é uma aplicação full-stack que combina dados da Riot Games API com análise de IA para gerar coaching personalizado. Em produção, um único container Docker serve tanto a API quanto o frontend estático.

## Fluxo de Dados Principal

```
Usuário digita Riot ID (ex: "Delsin#LEWA")
         │
         ▼
┌─────────────────────────────────────────┐
│          Frontend (React + Vite)         │
│  SearchBar → axios GET /api/player/:id   │
└──────────────────┬──────────────────────┘
                   │ HTTP
                   ▼
┌─────────────────────────────────────────┐
│         Backend (Express :4000)          │
│                                          │
│  1. Riot Account API                     │
│     Nome#TAG → PUUID                    │
│                                          │
│  2. Riot Match V5                        │
│     PUUID → 20 match IDs                │
│     Concurrent fetch (5 por lote)        │
│     ↓ cache 15 min (MATCH_CACHE)        │
│                                          │
│  3. analyzeMatch() [regras locais]       │
│     KDA, CS/min, Gold/min, KP           │
│     → positivos / negativos / veredito  │
│                                          │
│  4. generateDiagnosis()                  │
│     → título + plano de ação            │
│                                          │
└──────────────────┬──────────────────────┘
                   │ JSON
                   ▼
     Frontend renderiza dashboard
     (KPI cards, lista de partidas, diagnóstico)
```

## Fluxo de Timeline (lazy load)

```
Usuário clica em uma partida
         │
         ▼
GET /api/timeline/:matchId?puuid=xxx
         │
         ▼
┌─────────────────────────────────────────┐
│  Riot Match V5 Timeline                  │
│  (frames minuto a minuto)                │
│         │                                │
│  processTimeline()                       │
│  → goldDiffs[]   (blue vs red por min)  │
│  → events[]      (kills, baron, drag...) │
│  → tippingPoint  (momento da virada)    │
│         │                                │
│  laneDetector.detectLane()               │
│  → teamPosition > indivPos > spells >   │
│     heatmap de posição                   │
│         │                                │
│  laneDetector.findOpponent()             │
│  → participantId do oponente 1v1        │
│         │                                │
│  calculateLaneGoldDiff()                 │
│  → diff de ouro frame a frame           │
│         │                                │
│  analyseLaneDiff()                       │
│  → veredito + trend + peak adv/def      │
│                                          │
│  ↓ cache 15 min (TIMELINE_CACHE)        │
└──────────────────┬──────────────────────┘
                   │
                   ▼
  Frontend: GoldChart + TimelineViewer + Lane tab
```

## Fluxo de IA (sob demanda)

```
Usuário clica em "Atlas Brain"
         │
         ▼
GET /api/ai-coach/:matchId?puuid=xxx
         │
         ▼
┌─────────────────────────────────────────┐
│  Reutiliza MATCH_CACHE e TIMELINE_CACHE │
│         │                                │
│  dataSynthesizer.synthesize()            │
│  → payload compacto (evita tokens):     │
│     playerSummary, teams, laneContext,  │
│     teamGoldTimeline, tippingPoint,     │
│     keyEvents, ruleBasedAnalysis        │
│         │                                │
│  Groq API (LLaMA 3.3 70B)               │
│  temp=0.2, response_format: json_object │
│  System prompt com regras rígidas:      │
│    - result field = fonte da verdade    │
│    - vitória NÃO pode virar "derrota"   │
│    - 3 dicas com métricas concretas     │
│         │                                │
│  Retry com backoff exponencial (429)    │
│  ↓ cache 1 hora (AI_CACHE)             │
└──────────────────┬──────────────────────┘
                   │
                   ▼
  { mainIssue, detailedAnalysis,
    actionableTips[3], criticalMoment }
```

## Estratégia de Cache

| Cache | Chave | TTL | Propósito |
|---|---|---|---|
| `MATCH_CACHE` | `matchId` | 15 min | Dados completos da partida |
| `TIMELINE_CACHE` | `matchId:puuid` | 15 min | Timeline processada + lane |
| `PLAYER_CACHE` | `puuid` | 15 min | Payload completo do jogador |
| `AI_CACHE` | `ai:matchId:puuid` | 1 hora | Respostas do Groq (quota) |

## Controle de Rate Limit (Riot API)

- Concorrência máxima: 5 requests simultâneos por lote
- Pausa entre lotes: 250ms
- Retry em 429: `Retry-After` header × backoff exponencial (até 4 tentativas)
- Limites da Riot Development Key: 20 req/s, 100 req/2min

## Estrutura de Decisão — Lane Detector

```
participant.teamPosition (Riot calculado) ──────────► TOP/JG/MID/ADC/SUP
         ↓ (não disponível)
participant.individualPosition (autodeclarado) ────► TOP/JG/MID/ADC/SUP
         ↓ (não disponível)
Summoner Spells heurística:
  Smite          → JUNGLE
  Exhaust/Barrier → SUPPORT
  Heal           → ADC
  TP + Ignite    → MID
  TP             → TOP
  Ignite         → MID
         ↓ (inconclusivo)
Heatmap de posição (frames 2-10):
  x<5000, y>9000 → TOP
  x>9000, y<5000 → BOT/ADC
  |x-y|<3000    → MID
  resto          → JUNGLE
         ↓ (ambíguo)
         UNKNOWN
```

## Deploy em Produção (Docker Multi-Stage)

```
Stage 1 (builder — descartado):
  Node 18 Alpine
  npm ci --prefix frontend
  vite build → /app/dist

Stage 2 (runner — imagem final ~200 MB):
  Node 18 Alpine
  npm ci --omit=dev --prefix backend
  COPY backend/src → /app/backend/src
  COPY dist → /app/public
  ENV NODE_ENV=production
  EXPOSE 4000
  CMD node backend/src/server.js
```

Em produção, `express.static('/app/public')` serve o React build diretamente pelo Express na mesma porta 4000.
