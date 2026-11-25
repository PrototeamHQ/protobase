import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { scopedTablesIn, type ScopedName } from './sql-text'

/** One way past the organization scope: its file, line and what it is. */
export type Finding = { file: string; line: number; what: string }

// What an interpolation stands for in the text around it: a value or SQL of its own, which names no table here.
const placeholder = ' ? '

/** The names a file's imports from `kysely` give `sql` and `CompiledQuery`, aliases and a namespace's included. */
export type KyselyNames = { sql: Set<string>; compiledQuery: Set<string>; namespaces: Set<string> }

export const kyselyNames = (source: ts.SourceFile): KyselyNames => {
  const names: KyselyNames = { sql: new Set(), compiledQuery: new Set(), namespaces: new Set() }
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== 'kysely') continue
    const bindings = statement.importClause?.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) names.namespaces.add(bindings.name.text)
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text
      if (imported === 'sql') names.sql.add(element.name.text)
      if (imported === 'CompiledQuery') names.compiledQuery.add(element.name.text)
    }
  }
  return names
}

const exportedName = { sql: 'sql', compiledQuery: 'CompiledQuery' } as const

// Whether `node` is `sql` or `CompiledQuery` (`which`): by its own name, a name the file's imports give it, such as
// `q` for `sql as q`, or through a namespace, such as `k.sql`.
const isKysely = (node: ts.Expression, names: KyselyNames, which: keyof typeof exportedName) => {
  if (ts.isIdentifier(node)) return node.text === exportedName[which] || names[which].has(node.text)
  return ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && names.namespaces.has(node.expression.text) && node.name.text === exportedName[which]
}

/**
 * The arguments of a call that become SQL text: every one of `sql.<any>(...)`, and the first of
 * `CompiledQuery.raw(sql, parameters)`, whose second holds bound values.
 */
const sqlArguments = (node: ts.CallExpression, names: KyselyNames) => {
  if (!ts.isPropertyAccessExpression(node.expression)) return []
  const { expression: receiver, name } = node.expression
  if (isKysely(receiver, names, 'sql')) return [...node.arguments]
  if (isKysely(receiver, names, 'compiledQuery') && name.text === 'raw') return node.arguments.slice(0, 1)
  return []
}

/** The most texts an argument is checked as: past it, its branches and joins are too many to read one by one. */
export const textLimit = 64

class TooManyTexts extends Error {}

// The texts an argument can be: each branch of a condition, each joining of a `+`, a template's literal parts.
const textsOf = (node: ts.Expression): string[] => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text]
  if (ts.isTemplateExpression(node)) return [templateText(node)]
  if (ts.isParenthesizedExpression(node)) return textsOf(node.expression)
  if (ts.isConditionalExpression(node)) return limited([...textsOf(node.whenTrue), ...textsOf(node.whenFalse)])
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const [left, right] = [textsOf(node.left), textsOf(node.right)]
    if (left.length * right.length > textLimit) throw new TooManyTexts()
    return left.flatMap((one) => right.map((other) => one + other))
  }
  if (ts.isArrayLiteralExpression(node)) return limited(node.elements.flatMap((element) => (ts.isExpression(element) ? textsOf(element) : [])))
  return [placeholder]
}

const limited = (texts: string[]) => {
  if (texts.length > textLimit) throw new TooManyTexts()
  return texts
}

const templateText = (node: ts.TemplateExpression) => [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(placeholder)

const taggedText = ({ template }: ts.TaggedTemplateExpression) => (ts.isNoSubstitutionTemplateLiteral(template) ? template.text : templateText(template))

// `x.withoutPlugins(...)` or `x['withoutPlugins'](...)`.
const dropsPlugins = ({ expression }: ts.CallExpression) =>
  (ts.isPropertyAccessExpression(expression) && expression.name.text === 'withoutPlugins') ||
  (ts.isElementAccessExpression(expression) && ts.isStringLiteralLike(expression.argumentExpression) && expression.argumentExpression.text === 'withoutPlugins')

const refusal = (table: string) => `${table} in raw SQL: write scoped('${table}') for the organization's rows, or unscoped('<reason>', '${table}') for every organization's`

/**
 * The raw SQL in `file` that names a scoped table as text, outside `scoped()` and `unscoped()`: a tagged template's
 * literal parts, whatever its tag, and the literal SQL arguments of `sql.<any>(...)` and `CompiledQuery.raw(...)`, under
 * the names the file's `kysely` imports give them; and its `withoutPlugins()` calls unless `mayDropPlugins`.
 */
export const findRawTables = (file: string, names: readonly ScopedName[], mayDropPlugins = false): Finding[] => {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const findings: Finding[] = []
  const report = (node: ts.Node, what: string) => findings.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, what })
  const check = (node: ts.Node, texts: () => string[]) => {
    try {
      for (const table of new Set(texts().flatMap((text) => scopedTablesIn(text, names)))) report(node, refusal(table))
    } catch (error) {
      if (!(error instanceof TooManyTexts)) throw error
      report(node, `raw SQL with more than ${textLimit} branches and joins to check: build it from fewer, or from sql fragments`)
    }
  }
  const imported = kyselyNames(source)

  const visit = (node: ts.Node) => {
    if (ts.isTaggedTemplateExpression(node)) check(node, () => [taggedText(node)])
    if (ts.isCallExpression(node)) check(node, () => limited(sqlArguments(node, imported).flatMap(textsOf)))
    if (ts.isCallExpression(node) && dropsPlugins(node) && !mayDropPlugins) report(node, "withoutPlugins() drops the organization scope: use db.unscoped('<reason>')")
    ts.forEachChild(node, visit)
  }
  visit(source)
  return findings
}
