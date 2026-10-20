import { contentRange, rangeStatus } from './content-range'
import type { RowsPage } from './read-rows'
import { restError, type RestError } from './rest-error'

export const jsonType = 'application/json; charset=utf-8'
export const objectType = 'application/vnd.pgrst.object+json; charset=utf-8'

/** Whether the client asked for one object rather than an array, as `.single()` and `.maybeSingle()` do. */
export const wantsObject = (request: Request) => (request.headers.get('accept') ?? '').includes('application/vnd.pgrst.object+json')

/** PGRST116 unless there is exactly one row, which an object response needs. */
export const checkSingle = (rows: number) => {
  if (rows !== 1) throw restError(406, 'PGRST116', 'Cannot coerce the result to a single JSON object', `The result contains ${rows} rows`)
}

/** The one element of a JSON array of one element, as Postgres's `json_agg` writes it: `[` and `]` around it. */
export const onlyElement = (array: string) => array.slice(1, -1)

/** The response of a page of rows read from `offset`: an array, or one object when asked for. */
export const pageResponse = (page: RowsPage, offset: number, object: boolean, headers: Record<string, string> = {}) => {
  const status = rangeStatus(offset, page.page, page.total)
  if (object) checkSingle(page.page)
  return new Response(object ? onlyElement(page.body) : page.body, {
    status,
    headers: { 'content-range': contentRange(offset, page.page, page.total), 'content-type': object ? objectType : jsonType, ...headers },
  })
}

export const errorResponse = (error: RestError) =>
  new Response(JSON.stringify(error.body), { status: error.status, headers: { 'content-type': jsonType, ...error.headers } })
