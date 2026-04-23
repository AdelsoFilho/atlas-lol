// =============================================================================
// ItemDisplay — Ícone de item do LoL com nome em PT-BR
//
// Usa a CDN do DataDragon para buscar as imagens.
// Tooltip nativo (title) exibe nome PT-BR + ID.
// Fallback visual se a imagem falhar (item removido/ID inválido).
// =============================================================================

import { useState } from "react";
import { getItemNamePt, getItemNameEn, ITEM_ICON_URL } from "../data/itemDictionary";
import { Package } from "lucide-react";

// ── Slot vazio ────────────────────────────────────────────────────────────────

function EmptySlot({ size }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-md bg-gray-900/60 border border-white/5 flex items-center justify-center shrink-0"
    />
  );
}

// ── Ícone com erro de carregamento ────────────────────────────────────────────

function ErrorSlot({ size, id }) {
  return (
    <div
      style={{ width: size, height: size }}
      title={`Item #${id} (imagem indisponível)`}
      className="rounded-md bg-gray-900 border border-white/10 flex items-center justify-center shrink-0"
    >
      <Package size={Math.max(10, Math.floor(size * 0.45))} className="text-gray-700" />
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

/**
 * Exibe um ícone de item do League of Legends com tooltip PT-BR.
 *
 * @param {object}  props
 * @param {number}  props.itemId     — ID do item (0 = slot vazio)
 * @param {number}  [props.size=32]  — Largura/altura do ícone em px
 * @param {boolean} [props.showName] — Exibe nome abaixo do ícone
 * @param {boolean} [props.showId]   — Exibe ID abaixo (útil para debug)
 * @param {string}  [props.className]— Classes extras para o container
 * @param {'sm'|'md'|'lg'} [props.nameSize='sm'] — Tamanho da fonte do nome
 */
export default function ItemDisplay({
  itemId,
  size = 32,
  showName = false,
  showId   = false,
  className = "",
  nameSize  = "sm",
}) {
  const [imgError, setImgError] = useState(false);

  // Slot vazio
  if (!itemId || itemId === 0) {
    return <EmptySlot size={size} />;
  }

  const namePt = getItemNamePt(itemId);
  const nameEn = getItemNameEn(itemId);

  // Tooltip: "Lâmina do Infinito (Infinity Edge) [3031]"
  const tooltipParts = [namePt];
  if (nameEn && nameEn !== namePt && !nameEn.startsWith("Item #")) {
    tooltipParts.push(`(${nameEn})`);
  }
  tooltipParts.push(`[${itemId}]`);
  const tooltip = tooltipParts.join(" ");

  const nameFontClass = {
    xs: "text-[9px]",
    sm: "text-[10px]",
    md: "text-xs",
    lg: "text-sm",
  }[nameSize] ?? "text-[10px]";

  return (
    <div className={`flex flex-col items-center gap-0.5 shrink-0 ${className}`}>
      {imgError ? (
        <ErrorSlot size={size} id={itemId} />
      ) : (
        <img
          src={ITEM_ICON_URL(itemId)}
          alt={namePt}
          title={tooltip}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setImgError(true)}
          style={{ width: size, height: size }}
          className="rounded-md border border-white/10 object-cover shrink-0
                     hover:border-blue-500/60 hover:ring-1 hover:ring-blue-500/40
                     transition-all cursor-default"
        />
      )}

      {showName && namePt && (
        <span
          className={`${nameFontClass} text-gray-400 text-center leading-tight
                      max-w-[64px] line-clamp-2`}
          title={tooltip}
        >
          {namePt}
        </span>
      )}

      {showId && (
        <span className="text-[8px] text-gray-700 font-mono">{itemId}</span>
      )}
    </div>
  );
}

// ── ItemRow: linha de 6 itens (slot 0-5) + trinket (slot 6) ──────────────────

/**
 * Exibe a linha completa de itens de um participante.
 * Recebe `items: number[]` (array de até 7 IDs, filtrado de zeros).
 * Exibe sempre 7 slots (6 itens + 1 trinket), preenchendo com vazios.
 *
 * @param {object} props
 * @param {number[]} props.items   — Array de IDs de itens
 * @param {number}   [props.size=28] — Tamanho de cada ícone
 * @param {boolean}  [props.showNames] — Mostrar nomes abaixo dos ícones
 */
export function ItemRow({ items = [], size = 28, showNames = false }) {
  // Preenche com 0 até 7 slots
  const slots = [...items, 0, 0, 0, 0, 0, 0, 0].slice(0, 7);

  return (
    <div className="flex items-start gap-1 flex-wrap">
      {slots.map((id, i) => (
        <ItemDisplay
          key={i}
          itemId={id}
          size={size}
          showName={showNames}
        />
      ))}
    </div>
  );
}
