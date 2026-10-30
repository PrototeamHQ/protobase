import { useEffect, useMemo } from 'react'
import type { FieldModel, ResourceModel } from '@protobase/schema'
import { useList } from '../data/use-list'

/** The most lines a record's line editor loads; a record with more shows them read-only, as it cannot save them as a whole. */
export const linesLimit = 1000

const byPosition = (a: Record<string, unknown>, b: Record<string, unknown>) => Number(a.position) - Number(b.position)

/**
 * The numbered lines of a record, in position order, as the server has them: every page, up to `linesLimit`, each as
 * large as the API gives. `labels` names the records their relations point at. Nothing is fetched without a lines resource.
 */
export const useLines = (lines: ResourceModel | undefined, link: FieldModel | undefined, parentKey: string, labels?: Record<string, string>) => {
  const list = useList(lines?.name ?? '', {
    enabled: Boolean(lines && link),
    filter: link ? `${link.name} = "${parentKey}"` : undefined,
    pageSize: 500,
    labels,
    ...(lines?.fields.position?.sortable && { orderBy: 'position asc' }),
  })
  // The same array while no page changes, so what depends on the lines is worked out again only when they do
  const items = useMemo(() => [...list.items].sort(byPosition), [list.data])
  const more = list.hasNextPage && list.items.length < linesLimit
  useEffect(() => {
    if (more && !list.isFetchingNextPage) void list.fetchNextPage()
  }, [more, list.isFetchingNextPage])
  return {
    items,
    labels: list.labels,
    loading: (list.isPending || more) && Boolean(lines),
    /** Every line is loaded, so the lines can be saved as a whole. */
    complete: !list.hasNextPage,
  }
}
