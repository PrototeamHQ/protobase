export type QueryErrorCode =
  | 'unknown_field'
  | 'not_filterable'
  | 'not_sortable'
  | 'unsupported_operator'
  | 'unsupported_field_type'
  | 'missing_tenant'
  | 'invalid_filter'
  | 'invalid_value'
  | 'invalid_sort'
  | 'invalid_cursor'
  | 'invalid_limit'
  | 'invalid_option'
  | 'no_statistics'
  | 'no_search_fields'
  | 'missing_extension'

/** Thrown for any request the query layer refuses; `code` is the stable part, `message` is for humans. */
export class QueryError extends Error {
  constructor(readonly code: QueryErrorCode, message: string) {
    super(message)
    this.name = 'QueryError'
  }
}
