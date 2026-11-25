import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { scopedTablesIn, type ScopedName } from './sql-text'

/** One way past the organization scope: its file, line and what it is. */
export type Finding = { file: string; line: number; what: string }

// What an interpolation stands for in the text around it: a value or SQL of its own, which names no table here.
const placeholder = ' ? '

const isCall = (node: ts.CallExpression, object: string, method: string) =>
  ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === object && node.expression.name.text === method

// `sql.<any>(...)` and `CompiledQuery.raw(...)`, whose literal arguments become SQL text.
const takesSqlText = (node: ts.CallExpression) =>
  isCall(node, 'CompiledQuery', 'raw') || (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'sql')

// The texts an argument can be: each branch of a condition, each joining of a `+`, a template's literal parts.
const textsOf = (node: ts.Expression): string[] => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text]
  if (ts.isTemplateExpression(node)) return [templateText(node)]
  if (ts.isParenthesizedExpression(node)) return textsOf(node.expression)
  if (ts.isConditionalExpression(node)) return [...textsOf(node.whenTrue), ...textsOf(node.whenFalse)]
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return textsOf(node.left).flatMap((left) => textsOf(node.right).map((right) => left + right))
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap((element) => (ts.isExpression(element) ? textsOf(element) : []))
  return [placeholder]
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
 * literal parts, whatever its tag, and the literal arguments of `sql.<any>(...)` and `CompiledQuery.raw(...)`; and its
 * `withoutPlugins()` calls unless `mayDropPlugins`.
 */
export const findRawTables = (file: string, names: readonly ScopedName[], mayDropPlugins = false): Finding[] => {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const findings: Finding[] = []
  const report = (node: ts.Node, what: string) => findings.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, what })
  const check = (node: ts.Node, texts: string[]) => {
    for (const table of new Set(texts.flatMap((text) => scopedTablesIn(text, names)))) report(node, refusal(table))
  }

  const visit = (node: ts.Node) => {
    if (ts.isTaggedTemplateExpression(node)) check(node, [taggedText(node)])
    if (ts.isCallExpression(node) && takesSqlText(node)) check(node, node.arguments.flatMap(textsOf))
    if (ts.isCallExpression(node) && dropsPlugins(node) && !mayDropPlugins) report(node, "withoutPlugins() drops the organization scope: use db.unscoped('<reason>')")
    ts.forEachChild(node, visit)
  }
  visit(source)
  return findings
}
