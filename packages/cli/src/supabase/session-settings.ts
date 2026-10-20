import { splitDump } from './statements'
import { tokenize, wordsAt } from './tokens'

/**
 * The settings a dump changes for the rest of its session: each `SET name = …` and `set_config('name', …)`. The
 * project's migrations run one after another on one connection, so a migration made from a dump resets them at its
 * end, and the next file runs as it would have without it.
 */
export const sessionSettings = (dump: string) => {
  const names = new Set<string>()
  for (const piece of splitDump(dump)) {
    if (piece.kind !== 'statement') continue
    const tokens = tokenize(piece.text)
    if (wordsAt(piece.text, tokens, 0, ['set']) && !wordsAt(piece.text, tokens, 1, ['local'])) names.add(tokens[1]!.word!)
    const call = wordsAt(piece.text, tokens, 0, ['select']) ? tokens.findIndex((_, i) => wordsAt(piece.text, tokens, i, ['set_config'])) : -1
    const name = call === -1 ? undefined : tokens[call + 2]
    if (name && piece.text[name.start] === "'") names.add(piece.text.slice(name.start + 1, name.end - 1))
  }
  return [...names]
}

/** Statements that put back each of `names`. */
export const resetSettings = (names: string[]) => names.map((name) => `RESET ${name};\n`).join('')
