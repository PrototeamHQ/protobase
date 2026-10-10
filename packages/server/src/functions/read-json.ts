import { badRequest } from '../problem'

type Issue = { message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }

/** A Standard Schema (https://standardschema.dev), such as a zod 4, Valibot or ArkType schema. */
export type StandardSchema<Output = unknown> = {
  readonly '~standard': {
    readonly version: 1
    readonly validate: (value: unknown) => { value: Output; issues?: undefined } | { issues: ReadonlyArray<Issue> } | Promise<{ value: Output; issues?: undefined } | { issues: ReadonlyArray<Issue> }>
    readonly types?: { readonly input: unknown; readonly output: Output }
  }
}

const fieldOf = (issue: Issue) => (issue.path ?? []).map((part) => String(typeof part === 'object' ? part.key : part)).join('.')

/**
 * The request's JSON body, checked against `schema` when one is given. A body that is no JSON is a 400 `malformed-json`
 * problem, one the schema refuses a 400 `invalid-body` problem listing each issue by field.
 */
export async function readJson(request: Request): Promise<unknown>
export async function readJson<Output>(request: Request, schema: StandardSchema<Output>): Promise<Output>
export async function readJson(request: Request, schema?: StandardSchema) {
  const text = await request.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) throw badRequest('malformed-json', 'The request body is not valid JSON')
    throw error
  }
  if (!schema) return body
  const result = await schema['~standard'].validate(body)
  if (!result.issues) return result.value
  const errors = result.issues.map((issue) => ({ field: fieldOf(issue), message: issue.message }))
  const first = errors[0]!
  throw badRequest('invalid-body', `The request body is invalid: ${first.field ? `${first.field}: ` : ''}${first.message}`, { errors })
}
