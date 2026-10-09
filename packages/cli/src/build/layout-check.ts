import { ts } from 'ts-morph'
import type { Plugin } from 'vite'

// Layout files are data: their JSX becomes JSON for the browser. The JSX runtime refuses a function prop when the
// config loads; this check refuses what is visibly not static at build time already, with the file and line, before
// any project code runs.

const pragma = /@jsxImportSource\s+@protobase\/layout\b/

export const isLayoutSource = (code: string) => pragma.test(code)

const elementName = (node: ts.Node): string => {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) return node.tagName.getText()
  return node.parent ? elementName(node.parent) : 'element'
}

const what = (expression: ts.Expression): string | undefined => {
  const inner = ts.isParenthesizedExpression(expression) ? expression.expression : expression
  if (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) return 'a function'
  if (ts.isClassExpression(inner)) return 'a class'
  if (ts.isNewExpression(inner)) return `a new ${inner.expression.getText()}`
  return undefined
}

const isHookCall = (node: ts.Node) => ts.isCallExpression(node) && /^use[A-Z]/.test(ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText())

/** Every place in a layout file where JSX gets a value that cannot be static, and every hook call. */
export const layoutProblems = (code: string, file: string): string[] => {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const problems: string[] = []
  const at = (node: ts.Node) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source))
    return `${file}:${line + 1}:${character + 1}`
  }
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
      const kind = what(node.initializer.expression)
      if (kind) problems.push(`${at(node)}: <${elementName(node)} ${node.name.getText()}> is ${kind}; layout props must be static data. Use <Action name="..."> for behaviour, or a custom component for React code.`)
    }
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const kind = what(node.expression)
      if (kind) problems.push(`${at(node)}: a child of <${ts.isJsxElement(node.parent) ? node.parent.openingElement.tagName.getText() : ''}> is ${kind}; layout children must be elements or text.`)
    }
    if (isHookCall(node)) problems.push(`${at(node)}: ${(node as ts.CallExpression).expression.getText()}() is a hook; layouts have no state. Put stateful UI in a custom component.`)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return problems
}

/** Fails the config bundle on the first layout file with problems, listing all of them. */
export const layoutCheck = (): Plugin => ({
  name: 'protobase-layout-check',
  enforce: 'pre',
  transform(code, id) {
    if (!/\.[jt]sx$/.test(id) || id.includes('/node_modules/') || !isLayoutSource(code)) return undefined
    const problems = layoutProblems(code, id)
    if (problems.length > 0) this.error(`Layout ${id} is not static:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
    return undefined
  },
})
