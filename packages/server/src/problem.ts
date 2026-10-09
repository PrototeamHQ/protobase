export type ProblemExtras = Record<string, unknown>

/** An RFC 9457 problem. Throw it anywhere below a route; the central error handler renders it. */
export class HttpProblem extends Error {
  constructor(
    readonly status: number,
    readonly slug: string,
    readonly title: string,
    detail: string,
    readonly extras: ProblemExtras = {},
    readonly headers: Record<string, string> = {},
  ) {
    super(detail)
  }

  get detail() {
    return this.message
  }
}

export const problemType = (slug: string) => `urn:protobase:problem:${slug}`

export const problemResponse = (problem: HttpProblem, instance: string) =>
  new Response(
    JSON.stringify({
      type: problemType(problem.slug),
      title: problem.title,
      status: problem.status,
      detail: problem.detail,
      instance,
      ...problem.extras,
    }),
    { status: problem.status, headers: { 'content-type': 'application/problem+json', ...problem.headers } },
  )

export const badRequest = (slug: string, detail: string, extras?: ProblemExtras) =>
  new HttpProblem(400, slug, 'Bad Request', detail, extras)

export const unauthorized = (detail: string) =>
  new HttpProblem(401, 'unauthenticated', 'Unauthorized', detail, {}, { 'www-authenticate': 'Bearer' })

export const forbidden = (slug: string, detail: string) => new HttpProblem(403, slug, 'Forbidden', detail)

export const notFound = (detail: string) => new HttpProblem(404, 'not-found', 'Not Found', detail)

export const preconditionFailed = (detail: string) =>
  new HttpProblem(412, 'precondition-failed', 'Precondition Failed', detail)

export const preconditionRequired = (detail: string) =>
  new HttpProblem(428, 'precondition-required', 'Precondition Required', detail)
