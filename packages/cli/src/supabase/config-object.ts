import { Node, type ObjectLiteralExpression } from 'ts-morph'
import { parseSource } from '../scaffold/project'

// The object a config function returns: `({ env }) => ({ ... })`, or one with a body that returns it.
const returnedObject = (fn: Node) => {
  if (!Node.isArrowFunction(fn) && !Node.isFunctionExpression(fn)) return undefined
  const body = fn.getBody()
  const expression = Node.isParenthesizedExpression(body) ? body.getExpression() : Node.isBlock(body) ? body.getStatements().flatMap((statement) => (Node.isReturnStatement(statement) ? [statement.getExpression()] : [])).at(-1) : body
  const unwrapped = expression && Node.isParenthesizedExpression(expression) ? expression.getExpression() : expression
  return unwrapped && Node.isObjectLiteralExpression(unwrapped) ? unwrapped : undefined
}

/**
 * The config object `protobase.config.ts` exports by default: written out, passed to a call such as `defineConfig`,
 * or returned by the config function; `undefined` when it exports none the import can see.
 */
export const exportedConfigObject = (text: string) => {
  const source = parseSource(text, 'protobase.config.ts')
  const exported = source.getExportAssignment((assignment) => !assignment.isExportEquals())?.getExpression()
  const argument = Node.isCallExpression(exported) ? exported.getArguments()[0] : exported
  const object: ObjectLiteralExpression | undefined = argument && (Node.isObjectLiteralExpression(argument) ? argument : returnedObject(argument))
  return { source, object }
}
