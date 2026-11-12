/** The lines a JSON block shows before it folds. */
export const foldedLines = 20

/** A text's line count, and its first `foldedLines` lines when it has more: `folded` is null when it fits. */
export const foldOf = (text: string) => {
  const lines = text.split('\n')
  if (lines.length <= foldedLines) return { lines: lines.length, folded: null }
  return { lines: lines.length, folded: lines.slice(0, foldedLines).join('\n') }
}
