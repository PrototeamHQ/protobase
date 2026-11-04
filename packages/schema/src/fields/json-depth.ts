/** How deeply a JSON field's value may nest: each array or object is one level. */
export const maxJsonDepth = 256

/**
 * Whether `value` nests at most `max` levels, counting each array or object as one level (`[]` is 1, a scalar 0).
 * It walks with a stack of its own rather than recursing, so a value nested far deeper than the call stack allows is
 * refused rather than overflowing, and it stops at the first level past `max`, which also ends a cyclic value.
 */
export const withinJsonDepth = (value: unknown, max = maxJsonDepth) => {
  const stack: [unknown, number][] = [[value, 0]]
  while (stack.length > 0) {
    const [current, depth] = stack.pop()!
    if (typeof current !== 'object' || current === null) continue
    if (depth + 1 > max) return false
    for (const child of Object.values(current)) stack.push([child, depth + 1])
  }
  return true
}
