import type { Problem } from '../problem'
import { expressionSource } from '../expressions'

/**
 * What an HTTP task's connection sends in this app: a header holding a secret, its whole value, such as `Bearer ...`;
 * null sends nothing in its place.
 */
export type ConnectionHeader = { header: string; secret: string } | null

/** The header each connection sends, by the connection's ARN, as the import is given them. */
export type ConnectionHeaders = Record<string, ConnectionHeader>

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const secretName = /^[A-Za-z_][A-Za-z0-9_]*$/
// Names JSONata reads as literals, never as a step of a path such as `$states.context.Secrets.<NAME>`
const literalNames = new Set(['true', 'false', 'null'])
const headerName = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

const asked = (arn: string) =>
  `names a connection, whose credentials this app does not hold: pass connection_headers { ${JSON.stringify(arn)}: { "header": "Authorization", "secret": "<NAME>" } }, the header its credentials go in and a secret workflows.secrets lists that holds the header's whole value, such as "Bearer ...", or null to send none`

/**
 * The ARN of the connection an HTTP task's `Authentication` or `InvocationConfig` names, or the problems that keep it
 * from being read: both or neither given, another field beside `ConnectionArn`, or the ARN as an expression.
 */
export const connectionOf = (args: Record<string, unknown>, state: string): { arn?: string; field?: string; problems: Problem[] } => {
  const given = ['Authentication', 'InvocationConfig'].filter((field) => args[field] !== undefined)
  if (given.length === 0) return { problems: [] }
  if (given.length > 1) return { problems: [{ state, field: 'Arguments.InvocationConfig', message: 'is given beside Authentication: an HTTP task names one connection' }] }
  const field = given[0]!
  const connection = args[field]
  if (!isObject(connection)) return { problems: [{ state, field: `Arguments.${field}`, message: 'is not { "ConnectionArn": "..." }' }] }
  const problems: Problem[] = Object.keys(connection)
    .filter((key) => key !== 'ConnectionArn')
    .map((key) => ({ state, field: `Arguments.${field}.${key}`, message: 'has no counterpart here: an HTTP task imports with its ConnectionArn alone' }))
  const arn = connection.ConnectionArn
  if (typeof arn !== 'string' || expressionSource(arn) !== undefined) problems.push({ state, field: `Arguments.${field}.ConnectionArn`, message: 'is not an ARN written out, which the import needs to know its header' })
  if (problems.length > 0) return { problems }
  return { arn: arn as string, field: `Arguments.${field}.ConnectionArn`, problems: [] }
}

/** The problem with the header given for a connection, if any. */
export const connectionHeaderProblem = (arn: string, given: ConnectionHeaders, state: string, field: string): Problem | undefined => {
  if (!Object.hasOwn(given, arn)) return { state, field, message: asked(arn) }
  const header = given[arn]
  if (header === null) return
  if (!isObject(header) || typeof header.header !== 'string' || !headerName.test(header.header)) return { state, field, message: `has a connection_headers entry whose header is not a header name: ${asked(arn)}` }
  if (typeof header.secret !== 'string' || !secretName.test(header.secret) || literalNames.has(header.secret)) return { state, field, message: `has a connection_headers entry whose secret is not a secret's name: ${asked(arn)}` }
}

/**
 * The request's headers with the connection's header added, taking the place of a header of that name in any case,
 * as a connection's header wins in Step Functions; headers written as an expression are merged when the step runs.
 */
export const withConnectionHeader = (headers: unknown, { header, secret }: { header: string; secret: string }) => {
  const value = `{% $states.context.Secrets.${secret} %}`
  const source = expressionSource(headers)
  if (source !== undefined) {
    const lower = JSON.stringify(header.toLowerCase())
    return `{% $merge([{}, $sift((${source}), function($value, $name) { $lowercase($name) != ${lower} }), { ${JSON.stringify(header)}: $states.context.Secrets.${secret} }]) %}`
  }
  const kept = Object.entries(isObject(headers) ? headers : {}).filter(([name]) => name.toLowerCase() !== header.toLowerCase())
  return { ...Object.fromEntries(kept), [header]: value }
}
