/**
 * How deeply a value's arrays and objects nest, walked with a stack of its own so no value can overflow the call stack;
 * it stops counting once past `most`, returning `most + 1`.
 */
export const nestingDepth = (value: unknown, most: number) => {
  let deepest = 0
  const stack: [unknown, number][] = [[value, 0]]
  while (stack.length > 0) {
    const [item, depth] = stack.pop()!
    if (typeof item !== 'object' || item === null) continue
    if (depth + 1 > most) return most + 1
    deepest = Math.max(deepest, depth + 1)
    for (const child of Object.values(item)) stack.push([child, depth + 1])
  }
  return deepest
}
