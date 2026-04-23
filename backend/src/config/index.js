"use strict";

const path = require("path");

// Carrega .env de backend/.env (dois níveis acima deste arquivo: config/ → src/ → backend/)
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const REQUIRED = ["RIOT_API_KEY"];
const missing  = REQUIRED.filter((k) => !process.env[k]);

if (missing.length) {
  console.error(
    `[FATAL] Variáveis de ambiente obrigatórias não encontradas: ${missing.join(", ")}\n` +
    `        Crie o arquivo backend/.env baseado no .env.example na raiz do projeto.`
  );
  process.exit(1);
}

module.exports = {
  RIOT_API_KEY : process.env.RIOT_API_KEY,
  GROQ_API_KEY : process.env.GROQ_API_KEY ?? null,
  PORT         : parseInt(process.env.PORT ?? "4000", 10),
  NODE_ENV     : process.env.NODE_ENV ?? "development",
};
