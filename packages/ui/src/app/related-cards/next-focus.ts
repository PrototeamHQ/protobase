/**
 * The card to focus when the card `gone` has left a list of cards, the keys `before` and `after` in their order: the
 * first after it that is still there, else the last before it that is; none when no card is left.
 */
export const nextFocus = (before: string[], after: string[], gone: string) => {
  const at = before.indexOf(gone)
  const stays = (key: string) => after.includes(key)
  return before.slice(at + 1).find(stays) ?? before.slice(0, Math.max(at, 0)).findLast(stays)
}
