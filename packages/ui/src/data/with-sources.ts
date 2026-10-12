import type { MetaData, SourceStatus } from './meta-data'
import type { SourceResult } from './use-source-metas'

/**
 * The app's `/meta` with the resources it draws from its sources: those of every source that is ready, with their views
 * and permissions, as if they were the app's own, and how far each source has loaded in `sources`. A source that is
 * loading or cannot be read adds no resources; the app shows its resources as unavailable (see `sourceStatusOf`).
 */
export const withSources = (meta: MetaData, results: readonly SourceResult[]): MetaData => {
  if (results.length === 0) return meta
  const ready = results.flatMap((result) => (result.state === 'ready' ? [result.meta] : []))
  const sources = results.map((result): SourceStatus => (result.state === 'error' ? { source: result.source, state: 'error', error: result.error } : { source: result.source, state: result.state }))
  return {
    ...meta,
    resources: { ...meta.resources, ...Object.fromEntries(ready.flatMap((part) => part.resources.map((model) => [model.name, model]))) },
    views: { ...meta.views, ...Object.fromEntries(ready.flatMap((part) => part.views.map((view) => [view.resource, view]))) },
    permissions: { ...meta.permissions, ...Object.assign({}, ...ready.map((part) => part.permissions)) },
    sources,
  }
}

/** The source the app draws `resource` from, with how far it has loaded; `undefined` for a resource of the app's own. */
export const sourceStatusOf = (meta: MetaData, resource: string) => meta.sources?.find((status) => status.source.resources.includes(resource))
