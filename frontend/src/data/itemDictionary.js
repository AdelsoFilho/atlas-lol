// =============================================================================
// itemDictionary.js — Tradução de IDs de Itens para PT-BR
//
// Fonte primária: nomes oficiais do cliente BR do League of Legends.
// Fonte secundária: localização manual para itens sem tradução disponível.
//
// Para atualizar o DDRAGON_VERSION, verifique o patch atual em:
//   https://ddragon.leagueoflegends.com/api/versions.json
// =============================================================================

// ── Versão do DataDragon (atualizar com o patch atual) ────────────────────────
export const DDRAGON_VERSION = "16.8.1";

// URL base para ícones de itens
export const ITEM_ICON_URL = (id) =>
  `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/${id}.png`;

// =============================================================================
// NOMES EM PT-BR
// Organizado por categoria. Chave = ID numérico do item.
// =============================================================================
export const ITEM_NAMES_PT_BR = {

  // ── Botas ──────────────────────────────────────────────────────────────────
  3006: "Grevas do Berserker",
  3009: "Botas de Celeridade",
  3020: "Sapatos do Feiticeiro",
  3047: "Proteções de Aço Batido",
  3111: "Botas de Mercúrio",
  3117: "Botas de Mobilidade",
  3158: "Botas Iônicas de Lucidez",

  // ── Penetração de Armadura (AD) ───────────────────────────────────────────
  3035: "Sussurro Final",
  3036: "Cumprimentos de Lord Dominik",   // ID legado + S14
  6693: "Cumprimentos de Lord Dominik",   // ID S11+
  3033: "Lembrete Mortal",                // ID legado
  6694: "Lembrete Mortal",               // ID S11+
  6697: "Rancor de Serylda",
  3071: "Machado Negro",

  // ── Componentes de crit/velocidade ───────────────────────────────────────
  3086: "Luva Veloz",             // Zeal — componente de RFC, Shiv, Runaan's, PD
  3044: "Faca do Caçador",        // Phage — componente de Trinity
  3046: "Dançarina Fantasma",     // Phantom Dancer
  3057: "Machado de Sheen",       // Sheen — componente de Trinity
  3067: "Bastão de Kindlegem",    // Kindlegem
  3077: "Encruzilhada",           // Tiamat

  // ── AD / Ataque Físico ────────────────────────────────────────────────────
  3031: "Lâmina do Infinito",
  3072: "Sede de Sangue",
  3074: "Hidra Voraz",
  3075: "Armadura de Espinhos",
  3085: "Furacão de Runaan",
  3087: "Lâmina de Statikk",
  3094: "Canhão de Fogo Rápido",
  3095: "Navalha da Tempestade",
  3124: "Lâmina Raivosa de Guinsoo",
  3142: "Lâmina Fantasma de Youmuu",
  3153: "Lâmina do Rei Arruinado",
  3078: "Força da Trindade",
  3748: "Hidra Titânica",
  6609: "Espada Corrompida de Chempunk",
  6676: "A Coletora",
  6691: "Lâmina do Crepúsculo de Draktharr",
  6692: "Eclipse",
  6671: "Força da Maré",          // Galeforce
  6672: "Matadora de Krakens",
  6673: "Arco Escudo Imortal",
  6675: "Lâmina Oscilante de Navori",
  6333: "Dança da Morte",

  // ── Penetração Mágica / AP ────────────────────────────────────────────────
  3100: "Flagelo da Lich",
  3135: "Cajado do Vazio",
  3157: "Ampulheta de Zhonya",
  3165: "Morellonomicon",
  3285: "Tempestade de Luden",
  3089: "Chapéu Mortal de Rabadon",
  3152: "Propulsor Hextech",
  4628: "Chama das Sombras",
  4633: "Pedra da Maré",
  4637: "Tempestade",
  4645: "Malignância",
  6699: "Cryptobloom",
  3030: "Aniquilador de Hextech",
  3040: "Lágrima de Deusa",
  3003: "Cajado de Archangel",

  // ── Tanque — Armadura ─────────────────────────────────────────────────────
  3068: "Égide de Fogo Solar",
  3082: "Armadura de Guardião",
  3083: "Armadura de Warmog",
  3110: "Coração Gelado",
  3143: "Presságio de Randuin",
  3742: "Presa do Homem Morto",
  3907: "Coração de Pedra",
  6664: "Jak'Sho, o Proteano",
  6665: "Coração de Pedra",             // ID alternativo S14

  // ── Tanque — Resistência Mágica ───────────────────────────────────────────
  3001: "Máscara Abissal",
  3065: "Visagem Espiritual",
  3091: "Fim dos Sentidos",
  3193: "Medidor de Sterak",
  3920: "Força da Natureza",
  6667: "Radiância Oca",

  // ── Defesa / Utilitário ───────────────────────────────────────────────────
  3026: "Anjo Guardião",
  3123: "Colete de Espinhos",
  3139: "Manto de Mercúrio",
  3814: "Escudo do Crepúsculo",

  // ── Suporte ───────────────────────────────────────────────────────────────
  2065: "Canção de Batalha de Shurelya",
  3011: "Purificador de Chemtech",
  3109: "Voto do Cavaleiro",
  3190: "Medalhão de Ferro Solar",
  3504: "Incensário Ardente",
  6617: "Renovador da Pedra Lunar",
  3050: "Zeke's Convergência",

  // ── Componentes comuns ────────────────────────────────────────────────────
  1004: "Amplificador de Fúria",
  1011: "Cinto de Gigante",
  1018: "Pedra Gêmea",
  1026: "Bastão Perdido",
  1028: "Cristal de Rubi",
  1029: "Capuz de Pano",
  1031: "Cota de Malha de Corrente",
  1033: "Manto Nulo-Mágico",
  1036: "Espada Longa",
  1037: "Machado da Raiva",
  1038: "Florete de BF",
  1042: "Adaga",
  1043: "Arco Recorrente",
  1052: "Amplificador de Abilidades",
  1053: "Vampirismo",
  1055: "Adaga",
  1056: "Esfera Doran",
  1057: "Escudo Doran",
  1058: "Cajado de Raio",
  1082: "Espada Doran",
  2003: "Poção de Cura",
  2031: "Poção Corrupta",
  2033: "Elixir de Ferro",
  2138: "Elixir de Feitiçaria",
  2139: "Elixir de Cólera",
  3133: "Martelo de Guerra de Caulfield",
  3134: "Perfurante Serrilhado",
};

// =============================================================================
// NOMES FALLBACK EM INGLÊS
// Para itens não mapeados em PT-BR, exibir nome em inglês se disponível.
// =============================================================================
export const ITEM_NAMES_EN = {
  3006: "Berserker's Greaves",
  3009: "Boots of Swiftness",
  3020: "Sorcerer's Shoes",
  3047: "Plated Steelcaps",
  3111: "Mercury's Treads",
  3117: "Mobility Boots",
  3158: "Ionian Boots of Lucidity",
  3035: "Last Whisper",
  3036: "Lord Dominik's Regards",
  6693: "Lord Dominik's Regards",
  3033: "Mortal Reminder",
  6694: "Mortal Reminder",
  6697: "Serylda's Grudge",
  3071: "Black Cleaver",
  3031: "Infinity Edge",
  3072: "Bloodthirster",
  3074: "Ravenous Hydra",
  3085: "Runaan's Hurricane",
  3086: "Zeal",
  3044: "Phage",
  3046: "Phantom Dancer",
  3057: "Sheen",
  3067: "Kindlegem",
  3077: "Tiamat",
  6671: "Galeforce",
  3087: "Statikk Shiv",
  3094: "Rapid Firecannon",
  3095: "Stormrazor",
  3124: "Guinsoo's Rageblade",
  3142: "Youmuu's Ghostblade",
  3153: "Blade of the Ruined King",
  3078: "Trinity Force",
  3748: "Titanic Hydra",
  6609: "Chempunk Chainsword",
  6676: "The Collector",
  6691: "Duskblade of Draktharr",
  6692: "Eclipse",
  6672: "Kraken Slayer",
  6673: "Immortal Shieldbow",
  6675: "Navori Flickerblade",
  3100: "Lich Bane",
  3135: "Void Staff",
  3157: "Zhonya's Hourglass",
  3165: "Morellonomicon",
  3285: "Luden's Tempest",
  3089: "Rabadon's Deathcap",
  3152: "Hextech Rocketbelt",
  4628: "Shadowflame",
  4633: "Riftmaker",
  4637: "Stormsurge",
  4645: "Malignance",
  6699: "Cryptbloom",
  3068: "Sunfire Aegis",
  3083: "Warmog's Armor",
  3110: "Frozen Heart",
  3143: "Randuin's Omen",
  3742: "Dead Man's Plate",
  3907: "Heartsteel",
  6664: "Jak'Sho the Protean",
  3001: "Abyssal Mask",
  3065: "Spirit Visage",
  3091: "Wit's End",
  3193: "Sterak's Gage",
  3920: "Force of Nature",
  6667: "Hollow Radiance",
  3026: "Guardian Angel",
  2065: "Shurelya's Battlesong",
  3011: "Chemtech Putrifier",
  3109: "Knight's Vow",
  3190: "Locket of the Iron Solari",
  3504: "Ardent Censer",
  6617: "Moonstone Renewer",
};

// =============================================================================
// FUNÇÕES AUXILIARES
// =============================================================================

/**
 * Retorna o nome em PT-BR do item. Fallback para inglês se não mapeado.
 * Se nenhum nome for encontrado, retorna "Item #ID".
 *
 * @param {number|string} id  — ID do item
 * @returns {string}
 */
export function getItemNamePt(id) {
  const key = Number(id);
  if (!key) return "";
  return (
    ITEM_NAMES_PT_BR[key] ??
    ITEM_NAMES_EN[key]     ??
    `Item #${key}`
  );
}

/**
 * Retorna o nome em inglês do item (para tooltip secundário ou debug).
 * @param {number|string} id
 * @returns {string}
 */
export function getItemNameEn(id) {
  const key = Number(id);
  if (!key) return "";
  return ITEM_NAMES_EN[key] ?? `Item #${key}`;
}

/**
 * Alias de conveniência — compatível com o getItemName usado no buildAnalyzer.
 */
export const getItemName = getItemNamePt;
