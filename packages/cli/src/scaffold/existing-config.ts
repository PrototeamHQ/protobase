import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { Node, SyntaxKind, type CallExpression, type ObjectLiteralExpression, type SourceFile } from 'ts-morph'
import { defaultColumn } from '../infer/default-column'
import { camelCase } from '../infer/names'
import { parseSource } from './project'

export type ExistingField = {
  name: string
  column: string
  ignored: boolean
  // First builder call, e.g. "integer" for `f.integer().optional()`.
  type?: string
  enumValues?: string[]
}

export type ExistingResource = {
  name: string
  // "schema.table" as written in `.table()`.
  table: string
  dir: string
  text: string
  fields: ExistingField[]
}

const unquote = (text: string) => text.replace(/^['"`]|['"`]$/g, '')

const stringArg = (call: CallExpression, index = 0) => {
  const arg = call.getArguments()[index]
  return arg && Node.isStringLiteral(arg) ? arg.getLiteralValue() : undefined
}

export const methodCalls = (root: CallExpression, method: string) =>
  [root, ...root.getDescendantsOfKind(SyntaxKind.CallExpression)].filter((c) => {
    const expression = c.getExpression()
    return Node.isPropertyAccessExpression(expression) && expression.getName() === method
  })

const describeField = (name: string, initializer: Node | undefined): ExistingField => {
  if (!initializer || Node.isNullLiteral(initializer)) {
    return { name, column: defaultColumn(name), ignored: true }
  }
  let column: string | undefined
  let type: string | undefined
  let enumValues: string[] | undefined
  let node: Node = initializer
  while (Node.isCallExpression(node)) {
    const expression = node.getExpression()
    if (!Node.isPropertyAccessExpression(expression)) break
    if (expression.getName() === 'column') column ??= stringArg(node)
    if (expression.getExpression().getText() === 'f') {
      type = expression.getName()
      const arg = node.getArguments()[0]
      if (type === 'enum' && arg && Node.isArrayLiteralExpression(arg)) {
        enumValues = arg.getElements().flatMap((el) => (Node.isStringLiteral(el) ? [el.getLiteralValue()] : []))
      }
      break
    }
    node = expression.getExpression()
  }
  return {
    name,
    column: column ?? defaultColumn(name),
    ignored: false,
    ...(type && { type }),
    ...(enumValues && { enumValues }),
  }
}

export const fieldsObject = (root: CallExpression): ObjectLiteralExpression | undefined => {
  const call = methodCalls(root, 'fields')[0]
  const arg = call?.getArguments()[0]
  return arg && Node.isObjectLiteralExpression(arg) ? arg : undefined
}

// The full `resource('x')...` builder chain and its `resource('x')` root call.
export const resourceChain = (source: SourceFile) => {
  const root = source
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText() === 'resource')
  const chainTop = root?.getFirstAncestor((a) => Node.isVariableDeclaration(a))?.getInitializer()
  if (!root || !chainTop || !Node.isCallExpression(chainTop)) return undefined
  return { root, chainTop }
}

export const parseResource = (text: string, dir: string): ExistingResource | undefined => {
  const chain = resourceChain(parseSource(text))
  if (!chain) return undefined
  const { root, chainTop } = chain
  const name = stringArg(root)
  const tableCall = methodCalls(chainTop, 'table')[0]
  const table = tableCall && stringArg(tableCall)
  const fields = fieldsObject(chainTop)
  if (!name || !table || !fields) return undefined
  return {
    name,
    table,
    dir,
    text,
    fields: fields.getProperties().flatMap((property) => {
      if (!Node.isPropertyAssignment(property)) return []
      return [describeField(unquote(property.getName()), property.getInitializer())]
    }),
  }
}

// Whether a database column is already declared (or ignored) by the resource.
export const findField = (resource: ExistingResource, column: string) =>
  resource.fields.find((field) =>
    field.ignored
      ? field.column.toLowerCase() === column.toLowerCase() || field.name === camelCase(column)
      : field.column === column,
  )

export const readExistingResources = async (configDir: string) => {
  const entries = await readdir(configDir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const resources = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const text = await readFile(path.join(configDir, entry.name, 'data.ts'), 'utf8').catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return undefined
            throw error
          },
        )
        return text === undefined ? undefined : parseResource(text, entry.name)
      }),
  )
  return resources.filter((resource) => resource !== undefined)
}
