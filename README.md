# Atlas LoL — Plataforma de Análise e Coaching

Analise suas partidas de League of Legends com IA. Digite seu Riot ID e receba feedback personalizado sobre farm, economia, posicionamento e macro.

## Pré-requisitos

| Ferramenta | Versão mínima |
|---|---|
| Node.js | 18.x |
| Python | 3.10+ (opcional, para extração em lote) |
| Docker + Compose | qualquer versão recente (deploy) |

## Setup rápido (desenvolvimento local)

**1. Clone e instale dependências**
```bash
git clone <url-do-repositorio>
cd atlas-lol
npm run install:all
```

**2. Configure as variáveis de ambiente**
```bash
cp .env.example backend/.env
# Edite backend/.env com suas chaves reais
```

**3. Inicie backend e frontend simultaneamente**
```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000
- Health check: http://localhost:4000/health

## Configuração das chaves

| Variável | Obrigatória | Onde obter |
|---|---|---|
| `RIOT_API_KEY` | Sim | [developer.riotgames.com](https://developer.riotgames.com/) — expira em 24h |
| `GROQ_API_KEY` | Não | [console.groq.com](https://console.groq.com/) — tier gratuito disponível |

> Sem `GROQ_API_KEY`, o botão "Atlas Brain" (análise de IA) fica desabilitado. O restante do dashboard funciona normalmente.

## Deploy com Docker

```bash
# Build e start
docker compose up --build

# Em background
docker compose up --build -d

# Parar
docker compose down
```

A aplicação ficará disponível em http://localhost:4000 (frontend + API no mesmo container).

## Extração de dados em lote (opcional)

O script `scripts/riot_extractor.py` baixa JSONs brutos da Riot API para análise offline.

```bash
pip install requests

export RIOT_API_KEY="RGAPI-sua-chave"
export RIOT_ID="SeuNome#TAG"

python scripts/riot_extractor.py
# Salva os JSONs em ./raw_data/
```

## Estrutura do projeto

```
atlas-lol/
├── backend/                  # API Node.js + Express
│   ├── src/
│   │   ├── config/           # Validação de variáveis de ambiente
│   │   ├── services/         # Groq AI coach + data synthesizer
│   │   ├── utils/            # Lane detector
│   │   └── server.js         # Entry point
│   └── package.json
├── frontend/                 # React 18 + Vite + Tailwind
│   ├── src/
│   │   ├── components/       # UI components
│   │   ├── hooks/            # Custom hooks
│   │   ├── services/         # Build analyzer
│   │   ├── utils/            # Formatters e helpers
│   │   └── data/             # Item dictionary PT-BR
│   └── package.json
├── docker/                   # Dockerfile multi-stage
├── scripts/                  # Ferramentas auxiliares
├── docs/                     # Documentação técnica
├── .env.example              # Template de variáveis (sem valores reais)
└── docker-compose.yml
```

## Endpoints da API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/player/:riotId` | 20 partidas + stats + diagnóstico |
| GET | `/api/timeline/:matchId?puuid=` | Timeline + lane detection + 1v1 gold |
| GET | `/api/ai-coach/:matchId?puuid=` | Análise Groq LLaMA 3.3 70B |
| GET | `/health` | Status do servidor e tamanho do cache |

Para documentação completa, veja [docs/API.md](docs/API.md).
