# Atlas LoL — Deploy com Docker

## Por que Multi-Stage Build?

O build do React exige ~400 MB de dependências de desenvolvimento (Vite, TypeScript, PostCSS…).
Nenhum desses pacotes precisa estar na imagem que roda em produção.

O Multi-Stage resolve isso em duas fases:

```
Stage 1 (builder)          Stage 2 (runner) ← imagem final
──────────────────         ─────────────────────────────────
node:18-alpine             node:18-alpine
+ 400 MB devDeps     →     + 80 MB prodDeps only
+ código React             + código do servidor
+ Vite build               + /public  (cópia do dist do Stage 1)
[DESCARTADO]               [ENVIADO PARA PRODUÇÃO]
```

**Resultado prático:**
- Imagem com tudo: ~950 MB
- Imagem multi-stage: ~220 MB
- Sem devDependencies, sem código-fonte do cliente, sem `.env` na imagem

---

## Pré-requisitos

- Docker Desktop instalado e rodando
- API Key válida da Riot Games (renove em https://developer.riotgames.com/)

---

## Opção 1 — Docker puro (recomendado para teste rápido)

### Build da imagem

```bash
cd "C:\Projeto Atlas\lol"

docker build -t atlas-lol .
```

O build passa por dois estágios e leva ~2-3 minutos na primeira vez.
Nas próximas execuções, camadas cacheadas tornam o processo mais rápido.

### Rodar o container

```bash
docker run -d \
  -p 4000:4000 \
  -e RIOT_API_KEY=RGAPI-sua-chave-aqui \
  --name atlas-lol \
  atlas-lol
```

Acesse em: **http://localhost:4000**

### Comandos úteis

```bash
# Ver logs em tempo real
docker logs -f atlas-lol

# Verificar status do healthcheck
docker inspect --format='{{.State.Health.Status}}' atlas-lol

# Parar o container
docker stop atlas-lol

# Remover o container (mantém a imagem)
docker rm atlas-lol

# Remover imagem para rebuild limpo
docker rmi atlas-lol
```

---

## Opção 2 — Docker Compose (recomendado para uso contínuo)

### Configurar a chave da API

```bash
# O arquivo server/.env já deve existir — confirme que tem:
cat server/.env
# RIOT_API_KEY=RGAPI-sua-chave-aqui
# PORT=4000
```

### Subir

```bash
docker compose up --build
```

Para rodar em background:

```bash
docker compose up --build -d
```

### Parar e remover

```bash
docker compose down
```

---

## Estrutura da imagem final

```
/app/
├── index.js          ← servidor Express
├── nodemon.json
├── node_modules/     ← apenas produção (express, axios, cors, dotenv)
└── public/           ← React compilado pelo Vite (copiado do Stage 1)
    ├── index.html
    └── assets/
        ├── index-[hash].js
        └── index-[hash].css
```

---

## Fluxo de requisição em produção

```
Navegador → http://localhost:4000
                    │
                    ▼
              Express (porta 4000)
                    │
         ┌──────────┴──────────┐
         │                     │
    /api/*                  /* (qualquer rota)
         │                     │
  Riot API calls         Serve public/index.html
  (diagnóstico)          (React SPA cuida do roteamento)
```

---

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| Container para imediatamente | `RIOT_API_KEY` não injetada | Adicione `-e RIOT_API_KEY=...` ou verifique o `.env` |
| `curl localhost:4000` sem resposta | Container não está rodando | `docker ps` → se ausente, `docker logs atlas-lol` |
| Healthcheck `unhealthy` | Servidor demorou para subir | Aguarde 15s (start_period) e verifique os logs |
| Imagem muito grande | Cache sujo do Docker | `docker system prune` + `docker build --no-cache -t atlas-lol .` |
