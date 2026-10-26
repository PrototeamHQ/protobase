// A config is one object, written out: it may import values from other files, but never load a part of itself
// later. This finds every `import()` in its source, which the loader refuses.

/** The ESTree nodes the check reads, as rolldown's parser gives them. */
export type Node = { type: string; start: number; end: number; [key: string]: unknown }

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && typeof (value as Node).type === 'string'

const literalOf = (node: Node | undefined) => (node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined)

/** The paths of the config's `import()` calls, `(computed)` for one it computes. */
export const lazyImports = (program: Node): string[] => {
  const found: string[] = []
  const walk = (node: Node) => {
    if (node.type === 'ImportExpression') found.push(literalOf(node.source as Node) ?? '(computed)')
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent') continue
      for (const child of Array.isArray(value) ? value : [value]) if (isNode(child)) walk(child)
    }
  }
  walk(program)
  return found
}
