import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { parseSync, type ESTree } from 'vite'

const extensions = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '/index.ts', '/index.js']

// The file a relative `export * from './x'` names, as TypeScript resolves it: `./x.js` may be `./x.ts`.
const resolveRelative = (from: string, specifier: string) => {
  const base = path.resolve(path.dirname(from), specifier)
  const bases = /\.m?js$/.test(base) ? [base, base.replace(/\.(m?)js$/, '.$1ts')] : [base]
  for (const candidate of bases.flatMap((each) => extensions.map((extension) => each + extension))) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return undefined
}

const exportName = (name: ESTree.ModuleExportName) => (name.type === 'Literal' ? String(name.value) : name.name)

const declaredNames = (declaration: ESTree.Declaration): string[] => {
  if (declaration.type === 'VariableDeclaration') return declaration.declarations.flatMap((each) => (each.id.type === 'Identifier' ? [each.id.name] : []))
  if ((declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') && declaration.id) return [declaration.id.name]
  return []
}

/**
 * The names a module exports, in the order its source declares them, following relative `export * from` into the
 * modules they name. A bundle's `import * as` namespace sorts its names; this is the order `protobase dev` keeps.
 * Names it cannot see, such as those of a package's `export *`, are left out.
 */
export const exportOrder = (file: string, seen = new Set<string>()): string[] => {
  if (seen.has(file)) return []
  seen.add(file)
  const { program } = parseSync(file, readFileSync(file, 'utf8'))
  const names = program.body.flatMap((statement): string[] => {
    if (statement.type === 'ExportNamedDeclaration') {
      if (statement.exportKind === 'type') return []
      if (statement.declaration) return declaredNames(statement.declaration)
      return statement.specifiers.filter((specifier) => specifier.exportKind !== 'type').map((specifier) => exportName(specifier.exported))
    }
    if (statement.type === 'ExportAllDeclaration') {
      if (statement.exportKind === 'type') return []
      if (statement.exported) return [exportName(statement.exported)]
      const target = statement.source.value.startsWith('.') ? resolveRelative(file, statement.source.value) : undefined
      return target ? exportOrder(target, seen).filter((name) => name !== 'default') : []
    }
    return []
  })
  return [...new Set(names)]
}
