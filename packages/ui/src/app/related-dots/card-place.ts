const gap = 6

type Box = { top: number; bottom: number; left: number; width: number }

/**
 * Where a card of `card`'s size goes for the dot at `dot`, in viewport pixels: below it, or above it when the viewport
 * has no room underneath, starting at its left edge and kept inside the viewport's sides.
 */
export const placeCard = (dot: Box, card: { width: number; height: number }, viewport: { width: number; height: number }) => {
  const below = dot.bottom + gap
  const top = below + card.height > viewport.height - gap ? Math.max(gap, dot.top - gap - card.height) : below
  const left = Math.max(gap, Math.min(dot.left, viewport.width - gap - card.width))
  return { top, left }
}
