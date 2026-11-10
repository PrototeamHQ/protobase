import { cacheSeconds } from '../run/cache/cache-ttl'
import { limits } from '../limits'
import { templateExpressions } from './expressions'
import { fieldPath, type Problem } from './problem'
import { expressionParsed } from './check-reads'
import type { BlockState } from './types'

// A secret passed to a block would be kept in its run's input: the block reads it itself, by name, when it runs.
const secretArguments = (state: BlockState, where: string): Problem[] =>
  [...templateExpressions(state.Arguments, ['Arguments']), ...templateExpressions(state.Cache.Key, ['Cache', 'Key'])].flatMap(({ path, source }) => {
    const reads = expressionParsed(source)
    if (!reads?.states.some((read) => read[0] === 'context' && read[1] === 'Secrets')) return []
    return [{ state: where, field: fieldPath(path), message: 'reads a secret, which a block would keep in its run; read it inside the block as $states.context.Secrets.<NAME>' }]
  })

/**
 * Why a Block cannot be saved beside what every state is checked for: a time to live that is no duration of up to 30
 * days, Arguments or a Key that read a secret, and more Blocks around it than `limits.blockDepth`.
 */
export const blockProblems = (state: BlockState, where: string, depth: number): Problem[] => {
  const problems: Problem[] = []
  if (cacheSeconds(state.Cache.Ttl) === undefined) problems.push({ state: where, field: 'Cache.Ttl', message: `is no time to live: give seconds from 1, or text such as "10 minutes", "1 hour" or "2 days", at most ${limits.cacheMaxSeconds / 86_400} days` })
  if (depth > limits.blockDepth) problems.push({ state: where, message: `is inside ${depth - 1} other Blocks, more than the ${limits.blockDepth - 1} a Block may be in` })
  return [...problems, ...secretArguments(state, where)]
}
