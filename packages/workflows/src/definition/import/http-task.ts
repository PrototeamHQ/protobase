import type { Problem } from '../problem'
import { expressionSource } from '../expressions'
import { connectionHeaderProblem, connectionOf, withConnectionHeader, type ConnectionHeaders } from './http-connection'
import { httpTaskResult, templateWithHttpTaskResult } from './result-shape'

/** The resource of the Step Functions HTTP task. */
export const httpTaskResource = 'arn:aws:states:::http:invoke'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// The HTTP task's arguments by the app:http argument each becomes; Authentication and InvocationConfig name its connection.
const argumentNames: Record<string, string> = { ApiEndpoint: 'url', Method: 'method', Headers: 'headers', QueryParameters: 'query', RequestBody: 'body' }
const connectionFields = ['Authentication', 'InvocationConfig']
const unsentMethods = ['HEAD', 'OPTIONS']

const otherArgument = (key: string) =>
  key === 'Transform' ? 'encodes the body as a form, which app:http does not do; send the body as text with a Content-Type header instead' : 'is not an argument of the HTTP task this app imports'

// A literal object of text values, as app:http takes headers and a query; an expression is checked when it runs.
const textRecordProblems = (value: unknown, state: string, field: string): Problem[] => {
  if (value === undefined || expressionSource(value) !== undefined) return []
  if (!isObject(value)) return [{ state, field, message: 'is not an object: app:http takes an object of text values' }]
  return Object.entries(value)
    .filter(([, item]) => Array.isArray(item) || isObject(item))
    .map(([name]) => ({ state, field: `${field}.${name}`, message: 'holds a list or an object: app:http sends one text value per name' }))
}

const methodProblems = (args: Record<string, unknown>, state: string): Problem[] => {
  const method = args.Method
  if (typeof method !== 'string' || expressionSource(method) !== undefined) return []
  const upper = method.toUpperCase()
  if (unsentMethods.includes(upper)) return [{ state, field: 'Arguments.Method', message: `is ${upper}, which app:http does not send: it sends GET, POST, PUT, PATCH and DELETE` }]
  if (upper === 'GET' && args.RequestBody !== undefined) return [{ state, field: 'Arguments.RequestBody', message: 'is given with GET, which app:http sends without a body: send it with POST, PUT or PATCH' }]
  return []
}

// A retrier's or catcher's error the HTTP task names that app:http does not fail with.
const errorProblem = (name: string): string | undefined => {
  if (name.startsWith('States.Http.StatusCode.')) return 'is a single status, which app:http does not tell apart: it fails with Http.Status for every status outside 2xx'
  if (name === 'States.Http.Socket') return 'is the HTTP task\'s timeout, which app:http does not fail with: it fails with Http.Network when no answer comes, and States.Timeout after the Task\'s TimeoutSeconds'
  if (name === 'States.TaskFailed') return "here matches only an error a step type does not name, never app:http's own: name Http.Status, Http.Network and the others list_workflow_types gives, or States.ALL"
  if (name.startsWith('States.Http.') || name.startsWith('Events.ConnectionResource.')) return 'is an error of the HTTP task or its connection, which app:http does not fail with'
}

const errorsProblems = (state: Record<string, unknown>, where: string): Problem[] =>
  ['Retry', 'Catch'].flatMap((field) =>
    (Array.isArray(state[field]) ? (state[field] as unknown[]) : []).flatMap((rule, index) => {
      const names = isObject(rule) && Array.isArray(rule.ErrorEquals) ? rule.ErrorEquals : []
      return names.flatMap((name, at) => {
        const message = typeof name === 'string' ? errorProblem(name) : undefined
        return message ? [{ state: where, field: `${field}[${index}].ErrorEquals[${at}]`, message: `is ${name}, which ${message}` }] : []
      })
    }),
  )

// The app:http arguments of an HTTP task whose arguments check out, the connection's header added to its headers.
const httpArguments = (args: Record<string, unknown>, header: ConnectionHeaders[string]) => {
  const mapped: Record<string, unknown> = Object.fromEntries(Object.entries(argumentNames).filter(([from]) => args[from] !== undefined).map(([from, to]) => [to, args[from]]))
  // Step Functions sends RequestBody as JSON whatever it holds, a text too
  if (args.RequestBody !== undefined) mapped.body_encoding = 'json'
  if (header) mapped.headers = withConnectionHeader(mapped.headers, header)
  return mapped
}

/**
 * An HTTP task in JSONata as an app:http step that sends the same request and gives the same result, or the problems
 * that keep it from doing so exactly, each by name: its arguments, method, connection and errors. Its `Output` and
 * `Assign` read the HTTP task's result, `{ StatusCode, StatusText, Headers, ResponseBody }`, and without an `Output` it
 * gives that, so later states read what they read in Step Functions.
 */
export const importHttpTask = (state: Record<string, unknown>, where: string, connections: ConnectionHeaders): { state: Record<string, unknown>; problems: Problem[] } => {
  const args = state.Arguments
  if (!isObject(args)) {
    const message = args === undefined ? 'is missing: an HTTP task gives at least its ApiEndpoint and Method' : 'is one expression, whose fields the import cannot tell apart: write ApiEndpoint, Method, Headers, QueryParameters and RequestBody each as a field of Arguments'
    return { state, problems: [{ state: where, field: 'Arguments', message }] }
  }
  const connection = connectionOf(args, where)
  const problems: Problem[] = [
    ...Object.keys(args).filter((key) => !Object.hasOwn(argumentNames, key) && !connectionFields.includes(key)).map((key) => ({ state: where, field: `Arguments.${key}`, message: otherArgument(key) })),
    ...methodProblems(args, where),
    ...textRecordProblems(args.Headers, where, 'Arguments.Headers'),
    ...textRecordProblems(args.QueryParameters, where, 'Arguments.QueryParameters'),
    ...connection.problems,
    ...errorsProblems(state, where),
  ]
  const headerProblem = connection.arn !== undefined ? connectionHeaderProblem(connection.arn, connections, where, connection.field!) : undefined
  if (headerProblem) problems.push(headerProblem)
  if (problems.length > 0) return { state, problems }
  const header = connection.arn !== undefined ? connections[connection.arn]! : null
  const imported: Record<string, unknown> = { ...state, Resource: 'app:http', Arguments: httpArguments(args, header), Output: state.Output === undefined ? `{% ${httpTaskResult} %}` : templateWithHttpTaskResult(state.Output) }
  if (state.Assign !== undefined) imported.Assign = templateWithHttpTaskResult(state.Assign)
  return { state: imported, problems: [] }
}
