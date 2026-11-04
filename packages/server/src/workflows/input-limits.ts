import { limits } from '@protobase/workflows'
import { badRequest } from '../problem'

// How deeply a value's arrays and objects nest, walked with a stack of its own so no input can overflow the call stack.
const depthOf = (value: unknown) => {
  let deepest = 0
  const stack: [unknown, number][] = [[value, 0]]
  while (stack.length > 0) {
    const [item, depth] = stack.pop()!
    if (typeof item !== 'object' || item === null) continue
    if (depth + 1 > limits.inputDepth) return depth + 1
    deepest = Math.max(deepest, depth + 1)
    for (const child of Object.values(item)) stack.push([child, depth + 1])
  }
  return deepest
}

/**
 * Refuses a run's input over `limits.inputBytes` as JSON or nested deeper than `limits.inputDepth`, before anything
 * evaluates it: a 400 problem, so the run is not created.
 */
export const checkRunInput = (input: unknown) => {
  if (depthOf(input) > limits.inputDepth) throw badRequest('input-too-deep', `A run's input nests at most ${limits.inputDepth} levels of arrays and objects`)
  const bytes = new TextEncoder().encode(JSON.stringify(input ?? null)).length
  if (bytes > limits.inputBytes) throw badRequest('input-too-large', `A run's input is at most ${limits.inputBytes / 1024 / 1024} MiB as JSON; this one is ${bytes} bytes`)
}
