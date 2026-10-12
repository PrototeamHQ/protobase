export const hash = (seed: number, index: number) => {
  let h = (seed ^ Math.imul(index + 0x9e3779b9, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

// Independent stream per (seed, index): lets any row be rebuilt without generating its neighbours.
export const rngAt = (seed: number, index: number) => {
  let state = hash(seed, index)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rand = ReturnType<typeof rngAt>

export const pick = <T>(rand: Rand, items: readonly T[]) => items[Math.floor(rand() * items.length)]!

export const int = (rand: Rand, min: number, max: number) => min + Math.floor(rand() * (max - min + 1))

export const weighted = <T>(rand: Rand, entries: ReadonlyArray<readonly [T, number]>) => {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = rand() * total
  for (const [value, weight] of entries) {
    roll -= weight
    if (roll < 0) return value
  }
  return entries[entries.length - 1]![0]
}

export const makeRng = (seed: number) => rngAt(seed, 0)
