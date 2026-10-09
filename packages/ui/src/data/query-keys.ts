export const keys = {
  meta: ['meta'] as const,
  list: (resource: string, filter: string, orderBy: string, pageSize: number, startToken: string) =>
    ['list', resource, filter, orderBy, pageSize, startToken] as const,
  page: (resource: string, filter: string, orderBy: string, pageSize: number, page: number) =>
    ['page', resource, filter, orderBy, pageSize, page] as const,
  /** A sidebar group's records; starts with `list`, so invalidating a resource's lists refreshes it too. */
  navRecent: (resource: string, filter: string, orderBy: string, pageSize: number) => ['list', resource, filter, orderBy, pageSize, 'nav-recent'] as const,
  first: (resource: string, filter: string, orderBy: string) => ['first-page', resource, filter, orderBy] as const,
  record: (resource: string, key: string) => ['record', resource, key] as const,
  facets: (resource: string, field: string, filter: string) => ['facets', resource, field, filter] as const,
  series: (resource: string, field: string, range: string, granularity: string, filter: string) =>
    ['series', resource, field, range, granularity, filter] as const,
  histogram: (resource: string, field: string, buckets: number, filter: string) => ['histogram', resource, field, buckets, filter] as const,
  relatedLabel: (resource: string, id: string) => ['related-label', resource, id] as const,
  labels: (resource: string, ids: string) => ['labels', resource, ids] as const,
  count: (resource: string, filter: string) => ['count', resource, filter] as const,
  firstRecord: (resource: string, filter: string, orderBy: string) => ['first-record', resource, filter, orderBy] as const,
  pathValue: (resource: string, key: string, path: string) => ['path-value', resource, key, path] as const,
  labelMap: (resource: string, ids: string) => ['label-map', resource, ids] as const,
}
