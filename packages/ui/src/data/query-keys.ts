export const keys = {
  meta: ['meta'] as const,
  /** A source's `/meta`, as far as the app draws it: its URL, and the resources the app lists for it. */
  sourceMeta: (url: string, resources: readonly string[]) => ['source-meta', url, resources.join(',')] as const,
  /** Every `/meta` query of the source at `url`. */
  sourceMetas: (url: string) => ['source-meta', url] as const,
  list: (resource: string, filter: string, orderBy: string, pageSize: number, startToken: string) =>
    ['list', resource, filter, orderBy, pageSize, startToken] as const,
  page: (resource: string, filter: string, orderBy: string, pageSize: number, page: number) =>
    ['page', resource, filter, orderBy, pageSize, page] as const,
  /** Every `page` of one list. */
  pages: (resource: string, filter: string, orderBy: string) => ['page', resource, filter, orderBy] as const,
  /** A sidebar group's records; starts with `list`, so invalidating a resource's lists refreshes it too. */
  navRecent: (resource: string, filter: string, orderBy: string, pageSize: number) => ['list', resource, filter, orderBy, pageSize, 'nav-recent'] as const,
  first: (resource: string, filter: string, orderBy: string) => ['first-page', resource, filter, orderBy] as const,
  record: (resource: string, key: string) => ['record', resource, key] as const,
  facets: (resource: string, field: string, filter: string) => ['facets', resource, field, filter] as const,
  series: (resource: string, field: string, range: string, granularity: string, filter: string) =>
    ['series', resource, field, range, granularity, filter] as const,
  histogram: (resource: string, field: string, buckets: number, filter: string) => ['histogram', resource, field, buckets, filter] as const,
  /** The records or buckets a map shows; `filter` holds its bounding box. */
  map: (resource: string, position: string, zoom: number, filter: string, orderBy: string) => ['map', resource, position, zoom, filter, orderBy] as const,
  relatedLabel: (resource: string, id: string) => ['related-label', resource, id] as const,
  labels: (resource: string, ids: string) => ['labels', resource, ids] as const,
  count: (resource: string, filter: string) => ['count', resource, filter] as const,
  /** How many rows an export of the list would hold, exactly up to 10,000; starts with `list`, so it refreshes with the list. */
  exportCount: (resource: string, filter: string) => ['list', resource, filter, 'export-count'] as const,
  firstRecord: (resource: string, filter: string, orderBy: string) => ['first-record', resource, filter, orderBy] as const,
  pathValue: (resource: string, key: string, path: string) => ['path-value', resource, key, path] as const,
}
