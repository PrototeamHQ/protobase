import { parseAst } from 'vite'
import { sharedModules } from '../project/shared-modules'

type Chunk = { code: string; dynamicImports: string[] }

const isShared = (source: unknown): source is string => typeof source === 'string' && (sharedModules as readonly string[]).includes(source)

// The name a specifier takes from its module: `default`, `*` for the whole module, or the name it imports or re-exports.
const takenName = (specifier: { type: string; imported?: { name?: string; value?: string }; local?: { name?: string; value?: string } }) => {
  if (specifier.type === 'ImportDefaultSpecifier') return 'default'
  if (specifier.type === 'ImportNamespaceSpecifier') return '*'
  const taken = specifier.type === 'ExportSpecifier' ? specifier.local : specifier.imported
  return taken?.name ?? taken?.value ?? '*'
}

/**
 * The names a plugin's built chunks take from each module shared with plugins, sorted: what is left once the build
 * has dropped unused code, from its imports, re-exports and `export *`, and `*` for a whole module it imports with
 * `import * as` or `import()`.
 */
export const sharedImports = (chunks: Chunk[]): Record<string, string[]> => {
  const taken = new Map<string, Set<string>>()
  const take = (module: string, name: string) => taken.set(module, (taken.get(module) ?? new Set()).add(name))
  for (const chunk of chunks) {
    for (const module of chunk.dynamicImports.filter(isShared)) take(module, '*')
    for (const node of parseAst(chunk.code).body) {
      if (node.type !== 'ImportDeclaration' && node.type !== 'ExportNamedDeclaration' && node.type !== 'ExportAllDeclaration') continue
      const source = node.source?.value
      if (!isShared(source)) continue
      if (node.type === 'ExportAllDeclaration') take(source, '*')
      else for (const specifier of node.specifiers) take(source, takenName(specifier as Parameters<typeof takenName>[0]))
    }
  }
  return Object.fromEntries([...taken].sort(([a], [b]) => (a < b ? -1 : 1)).map(([module, names]) => [module, [...names].sort()]))
}
