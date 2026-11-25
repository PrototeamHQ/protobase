import { readFileSync } from 'node:fs'
import ts from 'typescript'

/** The `unscoped(` uses of each file, by its path: the reviewed list's shape. */
export type UnscopedCounts = Record<string, number>

// `unscoped(...)` or `x.unscoped(...)`: a query, or a table in raw SQL, that reads every organization's rows.
const isUnscoped = ({ expression }: ts.CallExpression) =>
  (ts.isIdentifier(expression) && expression.text === 'unscoped') || (ts.isPropertyAccessExpression(expression) && expression.name.text === 'unscoped')

/** The `unscoped(` calls in `file`; a mention in a comment or a string is none. */
export const countUnscoped = (file: string) => {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  let count = 0
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isUnscoped(node)) count += 1
    ts.forEachChild(node, visit)
  }
  visit(source)
  return count
}

/** Each file whose count is not the one the reviewed list gives, in either direction, said as what to do. */
export const unlistedCounts = (found: UnscopedCounts, listed: UnscopedCounts) =>
  [...new Set([...Object.keys(found), ...Object.keys(listed)])]
    .sort()
    .filter((file) => (found[file] ?? 0) !== (listed[file] ?? 0))
    .map((file) => `${file}: ${found[file] ?? 0} unscoped() uses, the reviewed list gives ${listed[file] ?? 0}: review them and set the list to ${found[file] ?? 0}`)
