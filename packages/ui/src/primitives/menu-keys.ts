/**
 * The item of an open menu a key moves the focus to, from the item at `index` (-1 for none) of `count`: the arrows step
 * and wrap, Home and End jump to the ends. `undefined` for a key that does not move it.
 */
export const menuKeyTarget = (key: string, index: number, count: number): number | undefined => {
  if (count === 0) return undefined
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowDown') return index < 0 ? 0 : (index + 1) % count
  if (key === 'ArrowUp') return index < 0 ? count - 1 : (index - 1 + count) % count
  return undefined
}
