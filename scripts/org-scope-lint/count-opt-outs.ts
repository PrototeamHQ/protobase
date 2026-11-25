import { readFileSync } from 'node:fs'
import ts from 'typescript'

/** The ways out of the organization scope: each reads every organization's rows, and each call is on the reviewed list. */
export const optOuts = ['unscoped', 'acrossOrganizations', 'everyOrganization'] as const
export type OptOut = (typeof optOuts)[number]

/** The opt-out calls of each file, by its path and then by opt-out: the reviewed list's shape. */
export type OptOutCounts = Record<string, Partial<Record<OptOut, number>>>

const asOptOut = (name: string) => optOuts.find((optOut) => optOut === name)

// The local names a file's imports give the opt-outs, as `import { acrossOrganizations as across }` does.
const importedNames = (source: ts.SourceFile) => {
  const names = new Map<string, OptOut>()
  for (const statement of source.statements) {
    const bindings = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : undefined
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      const optOut = asOptOut((element.propertyName ?? element.name).text)
      if (optOut) names.set(element.name.text, optOut)
    }
  }
  return names
}

// `optOut(...)`, an aliased `alias(...)`, `x.optOut(...)` or `x['optOut'](...)`.
const calledOptOut = ({ expression }: ts.CallExpression, imported: Map<string, OptOut>) => {
  if (ts.isIdentifier(expression)) return imported.get(expression.text) ?? asOptOut(expression.text)
  if (ts.isPropertyAccessExpression(expression)) return asOptOut(expression.name.text)
  if (ts.isElementAccessExpression(expression) && ts.isStringLiteralLike(expression.argumentExpression)) return asOptOut(expression.argumentExpression.text)
  return
}

/** The opt-out calls in `file`, by opt-out, those with none left out; a mention in a comment or a string, or a definition, is none. */
export const countOptOuts = (file: string) => {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const imported = importedNames(source)
  const counts: Partial<Record<OptOut, number>> = {}
  const visit = (node: ts.Node) => {
    const optOut = ts.isCallExpression(node) ? calledOptOut(node, imported) : undefined
    if (optOut) counts[optOut] = (counts[optOut] ?? 0) + 1
    ts.forEachChild(node, visit)
  }
  visit(source)
  return counts
}

/** Each file and opt-out whose count is not the one the reviewed list gives, in either direction, said as what to do. */
export const unlistedCounts = (found: OptOutCounts, listed: OptOutCounts) =>
  [...new Set([...Object.keys(found), ...Object.keys(listed)])].sort().flatMap((file) =>
    optOuts
      .map((optOut) => ({ optOut, has: found[file]?.[optOut] ?? 0, gives: listed[file]?.[optOut] ?? 0 }))
      .filter(({ has, gives }) => has !== gives)
      .map(({ optOut, has, gives }) => `${file}: ${has} ${optOut}() uses, the reviewed list gives ${gives}: review them and set the list to ${has}`),
  )
