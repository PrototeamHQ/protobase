import type { CleanupReport } from '@protobase/server'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Runs the scheduled file deletes that are due and says what happened to each file. */
export const cleanupCommand = async (run: () => Promise<CleanupReport>, out: (text: string) => void) => {
  const { deleted, kept } = await run()
  if (deleted.length === 0 && kept.length === 0) return out('No file deletes were due\n')
  if (deleted.length > 0) out(`Deleted ${plural(deleted.length, 'file')}:\n${deleted.map((uri) => `  ${uri}\n`).join('')}`)
  if (kept.length > 0) out(`Kept ${plural(kept.length, 'file')} a row references again:\n${kept.map((uri) => `  ${uri}\n`).join('')}`)
}
