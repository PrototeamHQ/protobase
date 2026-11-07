import type { KeyShape } from '@protobase/workflows'

/**
 * The key shapes of step types as last read, each for a minute and at most 500 types, the oldest read going first: a
 * shape another process just added is missed for at most a minute.
 */
export const shapeMemo = (read: (type: string) => Promise<KeyShape[]>, now = () => Date.now()) => {
  const kept = new Map<string, { shapes: KeyShape[]; at: number }>()
  return {
    shapes: async (type: string) => {
      const found = kept.get(type)
      if (found && now() - found.at < 60_000) return found.shapes
      const shapes = await read(type)
      kept.delete(type)
      kept.set(type, { shapes, at: now() })
      if (kept.size > 500) kept.delete(kept.keys().next().value!)
      return shapes
    },
    forget: (type: string) => void kept.delete(type),
  }
}
