import ts from 'typescript'

/** A module of @protobase/ui's source: its path under src/, with its extension, and its text. */
export type Sources = Record<string, string>

/** A component or hook, as `<module path without extension>#<name>`: what `@protobase/ui/unstable/<module>` exports. */
export type BlockId = string

/** The opt-outs: building blocks that stay off the stable entry, each with why, and those nobody has looked at yet. */
export type OptOuts = { pending: BlockId[]; unstable: Record<BlockId, string> }

const extension = /\.tsx?$/
const area = (path: string) => (path.includes('/') ? path.slice(0, path.indexOf('/')) : path)

const resolveImport = (sources: Sources, from: string, specifier: string) => {
  const segments = [...from.split('/').slice(0, -1), ...specifier.split('/')]
  const parts: string[] = []
  for (const segment of segments) {
    if (segment === '..') parts.pop()
    else if (segment !== '.') parts.push(segment)
  }
  const base = parts.join('/')
  return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((path) => path in sources)
}

const isExported = (statement: ts.Statement) => ts.canHaveModifiers(statement) && Boolean(ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))

// A hook is a `use…` export; a component is a capitalised value a .tsx module exports.
const isBlock = (path: string, name: string) => /^use[A-Z]/.test(name) || (path.endsWith('.tsx') && /^[A-Z][a-z]/.test(name))

const exportedValues = (statement: ts.Statement): string[] => {
  if (ts.isVariableStatement(statement) && isExported(statement)) return statement.declarationList.declarations.flatMap((declaration) => (ts.isIdentifier(declaration.name) ? [declaration.name.text] : []))
  if (ts.isFunctionDeclaration(statement) && isExported(statement) && statement.name) return [statement.name.text]
  if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && !statement.isTypeOnly && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
    return statement.exportClause.elements.filter((element) => !element.isTypeOnly).map((element) => element.name.text)
  }
  return []
}

// The value names a statement takes from another module, with that module's specifier.
const importedValues = (statement: ts.Statement): { specifier: string; names: string[] } | undefined => {
  if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
    const clause = statement.importClause
    if (!clause || clause.isTypeOnly || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return undefined
    return { specifier: statement.moduleSpecifier.text, names: clause.namedBindings.elements.filter((element) => !element.isTypeOnly).map((element) => (element.propertyName ?? element.name).text) }
  }
  if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
    if (statement.isTypeOnly || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) return undefined
    return { specifier: statement.moduleSpecifier.text, names: statement.exportClause.elements.filter((element) => !element.isTypeOnly).map((element) => (element.propertyName ?? element.name).text) }
  }
  return undefined
}

/**
 * The building blocks of @protobase/ui: each component and hook that a module of another area (another folder under
 * src/) imports, so more than one part of Protobase's own screens is built from it.
 */
export const buildingBlocks = (sources: Sources): BlockId[] => {
  const blocks = new Set<BlockId>()
  const declared = new Map<string, Set<string>>()
  const parsed = Object.entries(sources).map(([path, text]) => ({ path, file: ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false) }))
  for (const { path, file } of parsed) {
    declared.set(path, new Set(file.statements.flatMap(exportedValues).filter((name) => isBlock(path, name))))
  }
  for (const { path, file } of parsed) {
    for (const statement of file.statements) {
      const imported = importedValues(statement)
      if (!imported || !imported.specifier.startsWith('.')) continue
      const target = resolveImport(sources, path, imported.specifier)
      if (!target || area(target) === area(path)) continue
      for (const name of imported.names) {
        if (declared.get(target)?.has(name)) blocks.add(`${target.replace(extension, '')}#${name}`)
      }
    }
  }
  return [...blocks].sort()
}

/**
 * What the stable entry is missing: building blocks it does not export and no opt-out names (`missing`), and opt-outs
 * that name no building block left to opt out, since it is stable now or no longer one (`stale`).
 */
export const unexported = (blocks: BlockId[], stable: string[], optOuts: OptOuts) => {
  const isStable = (block: BlockId) => stable.includes(block.slice(block.indexOf('#') + 1))
  const optedOut = new Set([...optOuts.pending, ...Object.keys(optOuts.unstable)])
  const missing = blocks.filter((block) => !isStable(block) && !optedOut.has(block))
  const stale = [...optedOut].filter((block) => !blocks.includes(block) || isStable(block)).sort()
  return { missing, stale }
}
