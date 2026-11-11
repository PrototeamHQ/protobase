import { useQueries } from '@tanstack/react-query'
import type { RelatedModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { useAdminMeta } from './meta-gate'
import { countQuery } from './pages/use-layout-data'
import { relatedMatch } from './related-match'

/** A related section and the value of this record its `field` is matched against. */
export type CountedRelated = { item: RelatedModel; value: string | number | boolean | null }

/** What some counts add up to: `null` when one could not be counted, `undefined` while one is still loading. */
export const countTotal = (counts: Array<number | null | undefined>) => {
  if (counts.some((count) => count === null)) return null
  if (counts.some((count) => count === undefined)) return
  return counts.reduce<number>((total, count) => total + count!, 0)
}

/**
 * How many records the reader may see in these related sections together, one count query each, shared with every
 * other count of the same records, so a live change reads them again; `undefined` while one is loading. A section
 * that can match nothing counts 0, and one of a resource the reader cannot list counts nothing; `null` when one fails, so a failure never reads as 0.
 */
export const useRelatedCount = (sections: CountedRelated[], enabled = true) => {
  const client = useClient()
  const { resources } = useAdminMeta()
  const counted = sections.flatMap(({ item, value }) => {
    const model = resources[item.resource]
    return model ? [{ model, match: relatedMatch(item, value, resources) }] : []
  })
  const queries = useQueries({
    queries: counted.map(({ model, match }) => ({ ...countQuery(client, model, match ?? ''), enabled: enabled && match !== null })),
  })
  return countTotal(
    counted.map(({ match }, index) => {
      if (match === null) return 0
      const query = queries[index]!
      if (query.isError) return null
      // A server that gives neither an exact nor an estimated total has no count to show
      return query.isSuccess ? (query.data ?? null) : undefined
    }),
  )
}
