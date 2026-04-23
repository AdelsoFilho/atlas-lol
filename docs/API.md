# Atlas LoL — Referência da API

Base URL (desenvolvimento): `http://localhost:4000`

---

## GET `/api/player/:riotId`

Retorna histórico de partidas, estatísticas agregadas e diagnóstico do jogador.

**Parâmetros de rota**
- `riotId` — Riot ID no formato `Nome#TAG` (ex: `Delsin#LEWA`)

**Resposta 200**
```json
{
  "gameName": "Delsin",
  "tagLine": "LEWA",
  "stats": {
    "gamesPlayed": 20,
    "wins": 11,
    "losses": 9,
    "winrate": 55,
    "kda": 3.14,
    "avgKills": 7.2,
    "avgDeaths": 4.1,
    "avgAssists": 8.5,
    "avgGoldPerMin": 412,
    "topChampion": "Jinx"
  },
  "recentMatches": [ /* array de partidas */ ],
  "diagnosis": {
    "title": "Potencial Latente — Problema de Macro",
    "text": "...",
    "plan": ["...", "...", "...", "..."],
    "deathWarning": null,
    "recurringPatterns": ["..."],
    "champStats": { "champion": "Jinx", "games": 8, "wins": 5, "winrate": 62, "avgKDA": 3.8 },
    "othersStats": { "games": 12, "wins": 6, "winrate": 50, "avgKDA": 2.7 }
  }
}
```

**Erros**
- `400` — Formato inválido (sem `#`)
- `404` — Jogador não encontrado
- `403` — API Key inválida

---

## GET `/api/timeline/:matchId`

Retorna timeline processada com gold diff, eventos e análise de lane.

**Parâmetros**
- `matchId` — ID da partida (ex: `BR1_1234567890`)
- `puuid` (query) — PUUID do jogador

**Resposta 200**
```json
{
  "playerTeam": "blue",
  "goldDiffs": [{ "minute": 0, "playerGold": 500, "enemyGold": 500, "diff": 0 }],
  "events": [{ "minute": 3, "second": 42, "type": "CHAMPION_KILL", "isPlayerKill": true }],
  "tippingPoint": { "minute": 22, "goldDeficit": -2800, "description": "..." },
  "gameDurationMin": 32,
  "lane": "ADC",
  "opponentChampion": "Caitlyn",
  "laneGoldDiff": [{ "minute": 0, "myGold": 500, "opponentGold": 500, "diff": 0 }],
  "laneAnalysis": {
    "verdict": "✅ Vantagem na rota — Jinx ganhou de Caitlyn",
    "detail": "+1200 de ouro no final.",
    "trend": null,
    "peakAdv": 1800,
    "peakDef": -300,
    "at15": 900,
    "lastDiff": 1200
  }
}
```

---

## GET `/api/ai-coach/:matchId`

Análise profunda com Groq LLaMA 3.3 70B.

**Parâmetros**
- `matchId` — ID da partida
- `puuid` (query) — PUUID do jogador

**Resposta 200**
```json
{
  "mainIssue": "Vitória — 9 mortes desnecessárias quase custaram o jogo",
  "detailedAnalysis": "Apesar da vitória, o padrão de mortes...",
  "actionableTips": [
    "Reduza mortes para no máximo 5 por partida",
    "Recall após 3 itens completos, não após cada kill",
    "Mantenha ward no rio 100% do tempo após min 10"
  ],
  "criticalMoment": { "minute": 18, "reason": "3 mortes consecutivas na jungle inimiga" },
  "matchId": "BR1_1234567890",
  "champion": "Jinx",
  "win": true
}
```

**Erros**
- `503` — GROQ_API_KEY não configurada
- `429` — Rate limit da Groq atingido (aguardar alguns minutos)

---

## GET `/health`

Verifica o estado do servidor e dos caches.

**Resposta 200**
```json
{
  "status": "ok",
  "cacheSize": { "matches": 12, "timelines": 4, "ai": 2 },
  "aiEnabled": true
}
```
