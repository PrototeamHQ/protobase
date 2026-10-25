export type ProblemError = {
  code?: string
  message: string
  hint?: string
  span?: { start: number; end: number }
  field?: string
  /** For an invalid field value, the limit it broke, such as `{ max: 200 }` or a decimal's `{ precision, scale }`. */
  params?: Record<string, unknown>
  parameter?: string
  /** The index of the operation in a batch that this error belongs to. */
  operation?: number
}

export type ProblemDetails = {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  /** The query parameter a filter or `order_by` error refers to. */
  parameter?: string
  errors?: ProblemError[]
  /** The index of the operation that failed, when the request was a batch. */
  operation?: number
  /** For a delete other records still point at: their resource, and its field pointing at the record, as far as the caller may know. */
  blockedBy?: { resource: string; field?: string }
  /** For `strong-sign-in-required`: how many minutes old the strong sign-in may be. */
  minutes?: number
}

/** A non-2xx response, parsed from `application/problem+json`. */
export class ApiError extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title)
    this.name = 'ApiError'
  }

  get status() {
    return this.problem.status
  }

  /** The problem slug, for example `invalid-filter` or `precondition-failed`. */
  get slug() {
    return this.problem.type.split(':').at(-1) ?? ''
  }

  /** For a batch: the index of the operation that failed, so the UI can name it. */
  get operation() {
    return this.problem.operation ?? this.errors.find((entry) => entry.operation !== undefined)?.operation
  }

  /** For a delete other records still point at: their resource, and the field to filter its list by. */
  get blockedBy() {
    return this.problem.blockedBy
  }

  get errors() {
    return this.problem.errors ?? []
  }

  /** Filter errors carry the span of the offending text, so the UI can underline it. */
  get filterErrors() {
    return this.slug === 'invalid-filter' ? this.errors : []
  }
}

/** `412`: the record changed since it was read. */
export class PreconditionFailedError extends ApiError {
  constructor(problem: ProblemDetails) {
    super(problem)
    this.name = 'PreconditionFailedError'
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError

const isProblem = (body: unknown): body is ProblemDetails =>
  typeof body === 'object' && body !== null && 'type' in body && 'status' in body

/** Turns a failed response into a typed error; bodies that are not problem+json become a generic problem. */
export const readProblem = async (response: Response) => {
  const isJson = response.headers.get('content-type')?.includes('json') ?? false
  const body: unknown = isJson ? await response.json() : undefined
  const problem = isProblem(body)
    ? body
    : { type: 'urn:protobase:problem:unknown', title: response.statusText || 'Request failed', status: response.status }
  return problem.status === 412 ? new PreconditionFailedError(problem) : new ApiError(problem)
}
