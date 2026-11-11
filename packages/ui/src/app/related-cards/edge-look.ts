import type { CSSProperties } from 'react'
import { valueColor, valueTone } from '../../live/value-color'
import { toneDots } from '../../primitives/badge'

/** How a card's edge looks for a value: filled with the hex colour its view gives it, else in its tone's colour, as its badge. */
export const edgeLook = (colors: Readonly<Record<string, string>> | undefined, value: unknown): { className?: string; style?: CSSProperties } => {
  const color = valueColor(colors, value)
  return color === undefined ? { className: toneDots[valueTone(colors, value)] } : { style: { backgroundColor: color } }
}
