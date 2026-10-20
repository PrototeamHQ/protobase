import { restError } from './rest-error'

// `Content-Range` of `page` rows from `offset`, of `total` when counted: `0-9/42`; a star for the rows without any, and
// for the total uncounted.
export const contentRange = (offset: number, page: number, total?: number) => `${page === 0 ? '*' : `${offset}-${offset + page - 1}`}/${total ?? '*'}`

/**
 * The status of a counted read: 206 when the page holds fewer rows than there are, 416 (PGRST103) when it starts past
 * them, else 200; uncounted, always 200.
 */
export const rangeStatus = (offset: number, page: number, total?: number) => {
  if (total === undefined) return 200
  if (offset > total) throw restError(416, 'PGRST103', 'Requested range not satisfiable', `An offset of ${offset} was requested, but there are only ${total} rows.`).withHeaders({ 'content-range': contentRange(offset, 0, total) })
  return page < total ? 206 : 200
}
