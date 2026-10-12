import { ts } from 'ts-morph'
import type { Plugin } from 'vite'

const layoutModule = '@protobase/layout'

// The local names `component` of @protobase/layout goes by in a module: imported by name, or through a namespace.
const componentImports = (source: ts.SourceFile) => {
  const named = new Set<string>()
  const namespaces = new Set<string>()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== layoutModule) continue
    const bindings = statement.importClause?.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text)
    if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) if ((element.propertyName ?? element.name).text === 'component') named.add(element.name.text)
  }
  return { named, namespaces }
}

// `component('Name', { plugin: '...' })`: a plugin provides it at runtime, not the project's UI.
const fromPlugin = (options: ts.Expression | undefined) =>
  options !== undefined &&
  ts.isObjectLiteralExpression(options) &&
  options.properties.some((property) => (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && property.name.getText() === 'plugin')

/**
 * The names a module declares with `component('Name')` from @protobase/layout, read from its source: the config does
 * not run at build time. A name that is not a string literal is not seen, nor one a plugin provides.
 */
export const declaredComponents = (code: string, file: string): string[] => {
  if (!code.includes(layoutModule)) return []
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const { named, namespaces } = componentImports(source)
  if (named.size === 0 && namespaces.size === 0) return []
  const isComponent = (callee: ts.Expression) =>
    (ts.isIdentifier(callee) && named.has(callee.text)) ||
    (ts.isPropertyAccessExpression(callee) && callee.name.text === 'component' && ts.isIdentifier(callee.expression) && namespaces.has(callee.expression.text))
  const names: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isComponent(node.expression) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) && !fromPlugin(node.arguments[1])) names.push(node.arguments[0].text)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return names
}

/** Adds the components every bundled module declares to `into`, for the check that the project's UI exports each. */
export const collectComponents = (into: Set<string>): Plugin => ({
  name: 'protobase-component-names',
  enforce: 'pre',
  transform(code, id) {
    if (!/\.[cm]?[jt]sx?$/.test(id.replace(/\?.*$/, ''))) return undefined
    for (const name of declaredComponents(code, id)) into.add(name)
    return undefined
  },
})
