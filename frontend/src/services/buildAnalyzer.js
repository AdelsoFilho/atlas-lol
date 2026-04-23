/**
 * buildAnalyzer.js
 *
 * Analisa a build do jogador e retorna avisos de diagnóstico com nomes em PT-BR.
 *
 * Main export: analyzeBuild(player, allParticipants, durationMin)
 *
 * Formato de saída:
 *   {
 *     phase:     'early' | 'mid' | 'late',
 *     status:    'OK' | 'WARNING' | 'CRITICAL',
 *     itemNames: string[],
 *     warnings:  Array<{ type, severity, text, suggestedItems }>
 *   }
 */

import { getItemNamePt } from "../data/itemDictionary";

// ---------------------------------------------------------------------------
// ITEM DATABASE  —  chave = item ID, valor = { tags: string[] }
// Nomes são resolvidos pelo itemDictionary (PT-BR).
// Tags guiam as regras de diagnóstico.
// ---------------------------------------------------------------------------
const ITEM_DB = {
  // ── Penetração física ──────────────────────────────────────────────────────
  3035: { tags: ['armor_pen', 'component'] },
  3036: { tags: ['armor_pen', 'ad', 'legendary'] },
  6693: { tags: ['armor_pen', 'ad', 'legendary'] },
  3033: { tags: ['armor_pen', 'ad', 'antiheal', 'legendary'] },
  6694: { tags: ['armor_pen', 'ad', 'antiheal', 'legendary'] },
  6697: { tags: ['armor_pen', 'ad', 'legendary'] },
  3071: { tags: ['armor_pen_flat', 'ad', 'hp', 'legendary'] },

  // ── Penetração mágica ─────────────────────────────────────────────────────
  3020: { tags: ['magic_pen', 'boots', 'ap'] },
  3135: { tags: ['magic_pen', 'ap', 'legendary'] },
  4628: { tags: ['magic_pen', 'ap', 'legendary'] },
  6699: { tags: ['magic_pen', 'ap', 'legendary'] },

  // ── Anti-cura ─────────────────────────────────────────────────────────────
  3123: { tags: ['antiheal', 'armor', 'component'] },
  3165: { tags: ['antiheal', 'ap', 'legendary'] },
  6609: { tags: ['antiheal', 'ad', 'legendary'] },
  3011: { tags: ['antiheal', 'support', 'ap', 'legendary'] },

  // ── AP core ───────────────────────────────────────────────────────────────
  3089: { tags: ['ap', 'legendary'] },
  3157: { tags: ['ap', 'armor', 'legendary'] },
  3285: { tags: ['ap', 'magic_pen', 'mythic'] },
  4633: { tags: ['ap', 'hp', 'mythic'] },
  3152: { tags: ['ap', 'mythic'] },
  4637: { tags: ['ap', 'mythic'] },
  4645: { tags: ['ap', 'mythic'] },
  3100: { tags: ['ap', 'ad', 'legendary'] },

  // ── AD / Ataque físico ────────────────────────────────────────────────────
  3031: { tags: ['ad', 'crit', 'legendary'] },
  3072: { tags: ['ad', 'lifesteal', 'legendary'] },
  3074: { tags: ['ad', 'aoe', 'legendary'] },
  3075: { tags: ['tank', 'armor', 'antiheal', 'legendary'] },
  3085: { tags: ['ad', 'attack_speed', 'legendary'] },
  3087: { tags: ['ad', 'attack_speed', 'crit', 'legendary'] },
  3094: { tags: ['ad', 'crit', 'attack_speed', 'legendary'] },
  3095: { tags: ['ad', 'crit', 'legendary'] },
  3124: { tags: ['ad', 'attack_speed', 'ap', 'legendary'] },
  3142: { tags: ['ad', 'lethality', 'legendary'] },
  3153: { tags: ['ad', 'lifesteal', 'legendary'] },
  3078: { tags: ['ad', 'hp', 'legendary'] },
  3748: { tags: ['tank', 'hp', 'ad', 'legendary'] },
  6609: { tags: ['antiheal', 'ad', 'legendary'] },
  6676: { tags: ['ad', 'armor_pen', 'legendary'] },
  6691: { tags: ['ad', 'lethality', 'mythic'] },
  6692: { tags: ['ad', 'armor_pen', 'mythic'] },
  6671: { tags: ['ad', 'crit', 'mythic'] },
  6672: { tags: ['ad', 'true_damage', 'mythic'] },
  6673: { tags: ['ad', 'crit', 'shield', 'mythic'] },
  6675: { tags: ['ad', 'crit', 'mythic'] },
  6333: { tags: ['ad', 'legendary'] },

  // ── Tanque — armadura ─────────────────────────────────────────────────────
  3068: { tags: ['tank', 'armor', 'hp', 'mythic'] },
  3082: { tags: ['tank', 'armor', 'component'] },
  3083: { tags: ['tank', 'hp', 'legendary'] },
  3110: { tags: ['tank', 'armor', 'legendary'] },
  3143: { tags: ['tank', 'armor', 'crit_reduction', 'legendary'] },
  3742: { tags: ['tank', 'armor', 'hp', 'legendary'] },
  3907: { tags: ['tank', 'hp', 'mythic'] },
  6664: { tags: ['tank', 'armor', 'mr', 'mythic'] },
  6665: { tags: ['tank', 'hp', 'mythic'] },

  // ── Tanque — resistência mágica ───────────────────────────────────────────
  3001: { tags: ['tank', 'mr', 'hp', 'legendary'] },
  3065: { tags: ['tank', 'mr', 'hp', 'legendary'] },
  3091: { tags: ['mr', 'ad', 'legendary'] },
  3193: { tags: ['tank', 'hp', 'ad', 'legendary'] },
  3920: { tags: ['tank', 'mr', 'hp', 'legendary'] },
  6667: { tags: ['tank', 'mr', 'hp', 'mythic'] },

  // ── HP ────────────────────────────────────────────────────────────────────
  3193: { tags: ['tank', 'hp', 'ad', 'legendary'] },

  // ── Suporte ───────────────────────────────────────────────────────────────
  3109: { tags: ['support', 'tank', 'hp', 'legendary'] },
  3190: { tags: ['support', 'mr', 'legendary'] },
  6617: { tags: ['support', 'ap', 'mythic'] },
  3504: { tags: ['support', 'ap', 'attack_speed', 'legendary'] },
  2065: { tags: ['support', 'mythic'] },

  // ── Botas ─────────────────────────────────────────────────────────────────
  3006: { tags: ['boots', 'ad', 'attack_speed'] },
  3009: { tags: ['boots'] },
  3047: { tags: ['boots', 'armor', 'tank'] },
  3111: { tags: ['boots', 'mr', 'tank'] },
  3117: { tags: ['boots'] },
  3158: { tags: ['boots', 'cdr'] },

  // ── Componentes (itens não-finalizados — disparam INCOMPLETE_BUILD) ────────
  1004: { tags: ['component', 'ap'] },
  1011: { tags: ['component', 'hp'] },
  1018: { tags: ['component', 'crit'] },
  1026: { tags: ['component', 'ap'] },
  1028: { tags: ['component', 'hp'] },
  1029: { tags: ['component', 'armor'] },
  1031: { tags: ['component', 'armor'] },
  1033: { tags: ['component', 'mr'] },
  1036: { tags: ['component', 'ad'] },
  1037: { tags: ['component', 'ad'] },
  1038: { tags: ['component', 'ad'] },          // Florete de BF — alto valor
  1042: { tags: ['component', 'attack_speed'] },
  1043: { tags: ['component', 'attack_speed'] },
  1052: { tags: ['component', 'ap'] },
  1053: { tags: ['component', 'lifesteal'] },
  1055: { tags: ['component', 'ad'] },
  1056: { tags: ['component', 'ap'] },
  1058: { tags: ['component', 'ap'] },
  1082: { tags: ['component', 'ad'] },
  3044: { tags: ['component', 'ad', 'hp'] },     // Phage
  3057: { tags: ['component', 'ap', 'ad'] },     // Sheen
  3067: { tags: ['component', 'hp'] },           // Kindlegem
  3077: { tags: ['component', 'ad', 'aoe'] },    // Tiamat
  3082: { tags: ['component', 'armor', 'tank'] },
  3086: { tags: ['component', 'ad', 'attack_speed', 'crit'] }, // Zeal — Luva Veloz
  3123: { tags: ['component', 'armor', 'antiheal'] },
  3133: { tags: ['component', 'ad'] },           // Martelo de Caulfield
  3134: { tags: ['component', 'ad', 'lethality'] },
  3035: { tags: ['component', 'armor_pen'] },
};

// ---------------------------------------------------------------------------
// MAPA DE CLASSE DE CAMPEÃO
// ---------------------------------------------------------------------------
const CHAMPION_CLASS = {
  // TANK
  Malphite: 'TANK', Ornn: 'TANK', Leona: 'TANK', Nautilus: 'TANK',
  Maokai: 'TANK', Sion: 'TANK', Galio: 'TANK', Rammus: 'TANK',
  Amumu: 'TANK', Sejuani: 'TANK', Zac: 'TANK', Nunu: 'TANK',
  "Cho'Gath": 'TANK', "Tahm Kench": 'TANK', Alistar: 'TANK',
  // FIGHTER
  Darius: 'FIGHTER', Garen: 'FIGHTER', Irelia: 'FIGHTER', Fiora: 'FIGHTER',
  Camille: 'FIGHTER', Aatrox: 'FIGHTER', Renekton: 'FIGHTER', Tryndamere: 'FIGHTER',
  Sett: 'FIGHTER', Mordekaiser: 'FIGHTER', Jax: 'FIGHTER', Nasus: 'FIGHTER',
  Volibear: 'FIGHTER', Illaoi: 'FIGHTER', Olaf: 'FIGHTER', Warwick: 'FIGHTER',
  // MAGE
  Lux: 'MAGE', Syndra: 'MAGE', Cassiopeia: 'MAGE', Orianna: 'MAGE',
  Veigar: 'MAGE', Viktor: 'MAGE', Ahri: 'MAGE', Zoe: 'MAGE',
  Taliyah: 'MAGE', Annie: 'MAGE', Brand: 'MAGE', "Vel'Koz": 'MAGE',
  Zyra: 'MAGE', Seraphine: 'MAGE', Karma: 'MAGE', Morgana: 'MAGE',
  // ASSASSIN
  Zed: 'ASSASSIN', Talon: 'ASSASSIN', Akali: 'ASSASSIN', Katarina: 'ASSASSIN',
  Qiyana: 'ASSASSIN', Ekko: 'ASSASSIN', Diana: 'ASSASSIN', Fizz: 'ASSASSIN',
  Kassadin: 'ASSASSIN', LeBlanc: 'ASSASSIN', Evelynn: 'ASSASSIN',
  Rengar: 'ASSASSIN', "Kha'Zix": 'ASSASSIN', Nidalee: 'ASSASSIN',
  // ADC
  Jinx: 'ADC', Caitlyn: 'ADC', Jhin: 'ADC', Ezreal: 'ADC', Ashe: 'ADC',
  Kalista: 'ADC', Xayah: 'ADC', Vayne: 'ADC', Tristana: 'ADC', Sivir: 'ADC',
  Twitch: 'ADC', "Miss Fortune": 'ADC', KogMaw: 'ADC', Samira: 'ADC',
  Aphelios: 'ADC', Nilah: 'ADC', Zeri: 'ADC', Lucian: 'ADC', Draven: 'ADC',
  // SUPPORT
  Thresh: 'SUPPORT', Lulu: 'SUPPORT', Nami: 'SUPPORT', Soraka: 'SUPPORT',
  Janna: 'SUPPORT', Blitzcrank: 'SUPPORT', Pyke: 'SUPPORT', Senna: 'SUPPORT',
  Bard: 'SUPPORT', Rell: 'SUPPORT', Zilean: 'SUPPORT', Yuumi: 'SUPPORT',
  "Renata Glasc": 'SUPPORT',
};

// ---------------------------------------------------------------------------
// BUILD DATABASE por campeão
// ---------------------------------------------------------------------------
const CHAMPION_BUILD_DB = {
  // ADC
  Caitlyn:    { core: [6675, 3031, 6693] },
  Jinx:       { core: [6672, 3031, 6693] },
  Jhin:       { core: [6675, 3094, 3031] },
  Ezreal:     { core: [3285, 6692, 3020] },
  Ashe:       { core: [6675, 3031, 6693] },
  // Mago
  Lux:        { core: [3285, 3089, 3157] },
  Syndra:     { core: [3285, 4628, 3089] },
  Cassiopeia: { core: [4645, 3089, 3157] },
  Ahri:       { core: [3285, 4628, 3089] },
  Viktor:     { core: [3285, 4637, 3089] },
  Orianna:    { core: [3285, 3089, 3157] },
  Veigar:     { core: [4645, 3089, 3157] },
  // Assassino
  Zed:        { core: [6691, 3142, 6676] },
  Talon:      { core: [6691, 3142, 3071] },
  Akali:      { core: [3152, 4628, 3089] },
  Katarina:   { core: [3152, 4628, 3089] },
  // Lutador
  Darius:     { core: [3071, 3748, 3083] },
  Garen:      { core: [3068, 3742, 3193] },
  Fiora:      { core: [3074, 6692, 3133] },
  Aatrox:     { core: [6692, 3071, 3748] },
  Irelia:     { core: [6692, 3071, 3031] },
  // Tanque
  Malphite:   { core: [6664, 3065, 3075] },
  Ornn:       { core: [6664, 3110, 3065] },
  Sion:       { core: [3907, 3110, 3065] },
  "Cho'Gath": { core: [3068, 3083, 3065] },
  Amumu:      { core: [3068, 3065, 3075] },
  // Suporte
  Thresh:     { core: [6617, 3109, 3190] },
  Nami:       { core: [6617, 3504, 3011] },
  Lulu:       { core: [6617, 3504, 3190] },
  // Jungle
  "Lee Sin":  { core: [6692, 3071, 3748] },
  Vi:         { core: [6664, 3742, 3065] },
  Hecarim:    { core: [3068, 3742, 3065] },
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function itemTags(id) {
  return ITEM_DB[id]?.tags ?? [];
}

function isComponent(id) {
  return itemTags(id).includes('component');
}

function countTankItems(participant) {
  return (participant.items ?? []).filter(id => itemTags(id).includes('tank')).length;
}

// ---------------------------------------------------------------------------
// REGRAS
// Cada função retorna Array<{ type, severity, text, suggestedItems }>.
// ---------------------------------------------------------------------------

/** Regra 1 — Penetração ausente vs. muitos tanques */
function ruleMissingPenetration(playerItems, playerClass, enemyTeam) {
  const warnings = [];

  const tankCount = enemyTeam.filter(p => {
    const cls = CHAMPION_CLASS[p.championName];
    if (cls === 'TANK') return true;
    if (cls === 'FIGHTER' && countTankItems(p) >= 3) return true;
    return false;
  }).length;

  if (tankCount < 3) return warnings;

  if (playerClass === 'ADC' || playerClass === 'ASSASSIN') {
    const hasArmorPen = playerItems.some(id =>
      itemTags(id).includes('armor_pen') || itemTags(id).includes('armor_pen_flat')
    );
    if (!hasArmorPen) {
      warnings.push({
        type:     'MISSING_PENETRATION',
        severity: 'high',
        text:     `Inimigos têm ${tankCount} tanques/lutadores e você não comprou penetração de armadura.`,
        suggestedItems: [
          getItemNamePt(6693),   // Cumprimentos de Lord Dominik
          getItemNamePt(6694),   // Lembrete Mortal
          getItemNamePt(6697),   // Rancor de Serylda
        ],
      });
    }
  } else if (playerClass === 'MAGE') {
    const hasMagicPen = playerItems.some(id => itemTags(id).includes('magic_pen'));
    if (!hasMagicPen) {
      warnings.push({
        type:     'MISSING_PENETRATION',
        severity: 'high',
        text:     `Inimigos têm ${tankCount} tanques/lutadores e você não comprou penetração mágica.`,
        suggestedItems: [
          getItemNamePt(3135),   // Cajado do Vazio
          getItemNamePt(4628),   // Chama das Sombras
          getItemNamePt(6699),   // Cryptobloom
        ],
      });
    }
  }

  return warnings;
}

/** Regra 2 — Itens core ausentes no mid/late */
function ruleMissingCore(player, playerItems, phase) {
  const warnings = [];
  if (phase === 'early') return warnings;

  const buildEntry = CHAMPION_BUILD_DB[player.championName];
  if (!buildEntry) return warnings;

  const missingCore = buildEntry.core.filter(id => !playerItems.includes(id));
  if (missingCore.length < 2) return warnings;

  const missingNames = missingCore.map(id => getItemNamePt(id));
  warnings.push({
    type:          'MISSING_CORE',
    severity:      'medium',
    text:          `Build incompleta para ${player.championName}: faltam ${missingNames.join(', ')} — itens centrais para o pico de poder.`,
    suggestedItems: missingNames,
  });

  return warnings;
}

/** Regra 3 — Tanque sem itens defensivos (glass cannon) */
function ruleGlassCannonTank(player, playerItems, playerClass, phase) {
  const warnings = [];
  if (playerClass !== 'TANK' || phase === 'early') return warnings;

  const tankItemCount = playerItems.filter(id => itemTags(id).includes('tank')).length;
  if (tankItemCount < 2) {
    warnings.push({
      type:          'GLASS_CANNON_TANK',
      severity:      'high',
      text:          `Build de vidro detectada em ${player.championName} — menos de 2 itens defensivos. Tanques sem resistências não absorvem dano efetivamente.`,
      suggestedItems: [],
    });
  }

  return warnings;
}

/** Regra 4 — Anti-cura ausente vs. inimigo com alta regeneração */
function ruleMissingAntiheal(playerItems, enemyTeam, phase, playerClass) {
  const warnings = [];
  if (phase === 'early') return warnings;

  const healChamps = new Set([
    'Soraka', 'Yuumi', 'Nami', 'Sona', 'Seraphine',
    'Aatrox', 'Sylas', 'Vladimir', 'Swain',
    'Warwick', 'Olaf', 'Mordekaiser',
  ]);

  const healerEnemy = enemyTeam.find(p => healChamps.has(p.championName));
  if (!healerEnemy) return warnings;

  const hasAntiheal = playerItems.some(id => itemTags(id).includes('antiheal'));
  if (hasAntiheal) return warnings;

  // Sugestão de anti-cura depende da classe do jogador
  const suggestedItems = playerClass === 'MAGE'
    ? [getItemNamePt(3165), getItemNamePt(3011)]          // Morellonomicon, Purificador
    : playerClass === 'ADC' || playerClass === 'ASSASSIN'
      ? [getItemNamePt(6694), getItemNamePt(6609)]         // Lembrete Mortal, Espada Corrompida
      : [getItemNamePt(3075), getItemNamePt(6694)];        // Armadura de Espinhos (tanques)

  warnings.push({
    type:          'MISSING_ANTIHEAL',
    severity:      'high',
    text:          `Inimigo com cura alta (${healerEnemy.championName}) sem Feridas Graves — a cura inimiga está reduzindo drasticamente seu dano efetivo.`,
    suggestedItems,
  });

  return warnings;
}

/**
 * Regra 5 — Build incompleta no Late Game
 * Dispara quando o jogador ainda carrega ≥ 2 componentes básicos após 30 min.
 */
function ruleIncompleteBuild(playerItems, phase, durationMin) {
  const warnings = [];
  // Exige pelo menos 30 min de jogo para não punir transições normais
  if (durationMin < 30) return warnings;

  const componentIds   = playerItems.filter(id => isComponent(id));
  const componentCount = componentIds.length;
  if (componentCount < 2) return warnings;

  const componentNames = componentIds.map(id => getItemNamePt(id));

  warnings.push({
    type:          'INCOMPLETE_BUILD',
    severity:      'medium',
    text:          `Build incompleta aos ${durationMin}min — você ainda carrega ${componentCount} componente${componentCount > 1 ? 's' : ''} básico${componentCount > 1 ? 's' : ''}`
                   + ` (${componentNames.join(', ')}). No Late Game todos os slots devem ser itens lendários.`,
    suggestedItems: [],
  });

  return warnings;
}

// ---------------------------------------------------------------------------
// ORQUESTRADOR
// ---------------------------------------------------------------------------
function runRules(player, playerItems, playerClass, enemyTeam, phase, durationMin) {
  return [
    ...ruleMissingPenetration(playerItems, playerClass, enemyTeam),
    ...ruleMissingCore(player, playerItems, phase),
    ...ruleGlassCannonTank(player, playerItems, playerClass, phase),
    ...ruleMissingAntiheal(playerItems, enemyTeam, phase, playerClass),
    ...ruleIncompleteBuild(playerItems, phase, durationMin),
  ];
}

// ---------------------------------------------------------------------------
// API PÚBLICA
// ---------------------------------------------------------------------------

/**
 * Analisa a build do jogador e retorna warnings com nomes em PT-BR.
 *
 * @param {object}   player           — participante ({ items, championName, teamId })
 * @param {object[]} allParticipants  — todos os 10 participantes
 * @param {number}   durationMin      — duração da partida em minutos
 * @returns {{ phase, status, itemNames, warnings }}
 */
export function analyzeBuild(player, allParticipants, durationMin) {
  const phase = durationMin < 15 ? 'early' : durationMin < 25 ? 'mid' : 'late';

  const playerItems = player.items ?? [];

  // Nomes PT-BR de todos os itens do jogador (log de aviso para IDs não mapeados)
  const itemNames = playerItems.map(id => {
    const name = getItemNamePt(id);
    if (name === `Item #${id}`) {
      console.warn(`[buildAnalyzer] Item ID ${id} não mapeado no dicionário PT-BR.`);
    }
    return name;
  }).filter(Boolean);

  const playerClass = CHAMPION_CLASS[player.championName] ?? 'UNKNOWN';
  const enemyTeam   = allParticipants.filter(p => p.teamId !== player.teamId);

  const warnings = runRules(player, playerItems, playerClass, enemyTeam, phase, durationMin);

  // Status global derivado da severidade mais alta
  const status = warnings.some(w => w.severity === 'high')   ? 'CRITICAL'
               : warnings.some(w => w.severity === 'medium') ? 'WARNING'
               : 'OK';

  return { phase, status, itemNames, warnings };
}

/** Retorna o nome PT-BR de um item (ou null se desconhecido). */
export function getItemName(id) {
  const name = getItemNamePt(id);
  return name.startsWith('Item #') ? null : name;
}

/** Retorna as tags de um item (ou [] se desconhecido). */
export function getItemTags(id) {
  return ITEM_DB[id]?.tags ?? [];
}
