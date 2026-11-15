import type { FetchInfiniteQueryOptions, FetchQueryOptions, QueryClient, QueryKey } from '@tanstack/react-query'
import type { Client } from '@protobase/client'
import type { LayoutNode, PlanRead } from '@protobase/layout'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { FieldWidget } from '../field-types/field-widget'

// A block that reads by itself, with labels, photos, totals or pages its planned read does not hold, still has its read
// start as the page opens: the page starts the block's own query, the same key and request, so the block finds it in
// the cache, or running, once it draws, and nothing is read twice.

/** What a block's query is made with beside its element: the API, the query cache, the app's models and the screen. */
export type BlockReader = {
  client: Client
  queryClient: QueryClient
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  fieldTypes: Readonly<Record<string, FieldWidget>> | undefined
  /** Whether the screen is a phone's, as `useIsXs` says. */
  xs: boolean
  /** The page's parameters, as `usePageParamValues` gives them, which a `{{@params.name}}` reads. */
  params: Readonly<Record<string, string>>
  /** What the page's address holds, as `usePageParams` gives it as `given`, such as the key a `select` chose. */
  given: Readonly<Record<string, string>>
}

/** A block's own query, started ahead of its block: its key, and how it starts, as one query or as a list's first page. */
export type BlockQuery = { queryKey: QueryKey; start: (queryClient: QueryClient) => Promise<void> }

/** The queries a block makes for its planned read `read`, its element's `{{path}}`s filled from the page's parameters. */
export type BlockQueries = (node: LayoutNode, read: PlanRead, reader: BlockReader) => BlockQuery[]

/** A query a block reads with `useQuery`. */
export const blockQuery = <T>(options: FetchQueryOptions<T>): BlockQuery => ({ queryKey: options.queryKey, start: (queryClient) => queryClient.prefetchQuery(options) })

/** A query a block reads with `useInfiniteQuery`: its first page. */
export const blockPages = <T, P>(options: FetchInfiniteQueryOptions<T, Error, T, QueryKey, P>): BlockQuery => ({
  queryKey: options.queryKey,
  start: (queryClient) => queryClient.prefetchInfiniteQuery(options),
})
