import { useState } from 'react'

/**
 * The key of the message the "New messages" line goes above, or undefined for none: decided once by `decide`, when the
 * first messages and the read position at opening are both there, and kept while the page is open, so the line neither
 * moves nor appears under a reader following new messages as they come.
 */
export const useNewLine = (decidable: boolean, decide: () => string | undefined) => {
  const [line, setLine] = useState<{ above: string | undefined }>()
  if (!line && decidable) {
    const decided = { above: decide() }
    setLine(decided)
    return decided.above
  }
  return line?.above
}
