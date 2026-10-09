import type { ResourceModel } from '@protobase/schema'
import { useList } from '../data/use-list'

const byPosition = (a: Record<string, unknown>, b: Record<string, unknown>) => Number(a.position) - Number(b.position)

/** The numbered lines of a record, in position order, as the server has them. Nothing is fetched without a lines resource. */
export const useLines = (lines: ResourceModel | undefined, parent: ResourceModel, parentKey: string) => {
  const link = lines && Object.values(lines.fields).find((field) => field.type === 'relation' && field.relation?.resource === parent.name)
  const list = useList(lines?.name ?? '', {
    enabled: Boolean(lines && link),
    filter: link ? `${link.name} = "${parentKey}"` : undefined,
    pageSize: 200,
    ...(lines?.fields.position?.sortable && { orderBy: 'position asc' }),
  })
  return { items: [...list.items].sort(byPosition), loading: list.isPending && Boolean(lines) }
}
