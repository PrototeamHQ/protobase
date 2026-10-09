export const reorder = <T>(items: readonly T[], from: number, to: number) => {
  if (from === to || from < 0 || from >= items.length) return [...items]
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(Math.min(Math.max(to, 0), next.length), 0, moved!)
  return next
}
