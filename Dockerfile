# =============================================================================
# Atlas LoL — Multi-Stage Dockerfile
#
# STAGE 1 (builder): instala dependências do frontend e compila com Vite.
#                    Esta imagem é descartada ao final — só o /dist viaja.
#
# STAGE 2 (runner):  imagem final limpa com apenas o servidor Node.js +
#                    os arquivos estáticos copiados do Stage 1.
#
# Resultado: imagem final ~200 MB em vez de ~1 GB com tudo junto.
#
# Build (a partir da raiz do projeto):
#   docker build -f docker/Dockerfile -t atlas-lol .
# =============================================================================


# ─── STAGE 1: Builder (frontend React + Vite) ────────────────────────────────
FROM node:18-alpine AS builder

LABEL stage="builder"

WORKDIR /app

# Copia apenas os manifests primeiro para aproveitar o cache de camadas.
COPY frontend/package.json frontend/package-lock.json ./

# `npm ci` usa exatamente as versões do package-lock.json
RUN npm ci

# Copia o restante do código-fonte do frontend
COPY frontend/ .

# Compila o React com Vite → saída padrão: ./dist
RUN npm run build


# ─── STAGE 2: Runner (servidor Node.js em produção) ──────────────────────────
FROM node:18-alpine AS runner

WORKDIR /app

# NODE_ENV=production habilita express.static('public') e desativa devtools
ENV NODE_ENV=production

# Copia manifests do backend para instalar apenas dependências de produção
COPY backend/package.json backend/package-lock.json ./

# --omit=dev exclui nodemon e outras devDependencies da imagem final
RUN npm ci --omit=dev

# Copia o código-fonte do backend
COPY backend/src ./backend/src

# ─── Cópia crítica: dist do Stage 1 → public/ (raiz da imagem) ──────────────
# O Express serve esta pasta com express.static() quando NODE_ENV=production.
# server.js aponta para path.resolve(__dirname, "../../public") = /app/public
COPY --from=builder /app/dist ./public

# Porta exposta pelo servidor Express
EXPOSE 4000

# Healthcheck: o Docker reinicia o container se o servidor não responder
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

# Inicia o servidor com Node (sem nodemon em produção)
CMD ["node", "backend/src/server.js"]
