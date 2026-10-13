import { useQuery } from '@tanstack/react-query'
import { createWhere, printFilter, type RelatedModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { keys } from '../data/query-keys'
import { listColumnNames } from '../live/columns-from-model'
import { Skeleton } from '../primitives/skeleton'
import { Section } from '../record-view'
import { EmbeddedDisplaySwitch, EmbeddedList } from './embedded-list/embedded-list'
import { useEmbeddedDisplay } from './embedded-list/use-embedded-display'
import { ErrorBanner } from './error-banner'
import { useAdminMeta } from './meta-gate'

const where = createWhere()

/** The most join records a section reads to find its records; the list API's largest page. */
const maxThrough = 500

// A single condition stays as it is, so the list that "View all" opens reads it as its own filter
const and = (...parts: Array<string | undefined>) => {
  const given = parts.filter((part): part is string => Boolean(part))
  return given.length === 1 ? given[0]! : given.map((part) => `(${part})`).join(' AND ')
}

/**
 * The filter on the section's resource: its `field` is this record's key, or, through a join resource, one of the keys
 * the join records that point at this record hold. `null` when no join record does, so nothing can match.
 */
const useMatch = (item: RelatedModel, recordKey: string) => {
  const client = useClient()
  const { resources } = useAdminMeta()
  const through = item.through
  const via = through ? resources[through.resource] : undefined
  const key = through?.key ?? via?.primaryKey[0]
  const viaFilter = through ? and(printFilter(where.eq(through.field, recordKey)), through.filter) : ''
  const collected = useQuery({
    queryKey: keys.list(via?.name ?? '', viaFilter, '', maxThrough, `related:${key}`),
    enabled: Boolean(via && key),
    queryFn: async () => {
      const page = await client.search(via!.name, { filter: viaFilter, fields: [key!], pageSize: maxThrough })
      return [...new Set(page.items.flatMap((row) => (row[key!] === null || row[key!] === undefined ? [] : [String(row[key!])])))]
    },
  })
  if (!through) return { filter: and(printFilter(where.eq(item.field, recordKey)), item.filter), isPending: false, error: null }
  if (!collected.data) return { filter: undefined, isPending: collected.isPending, error: collected.error }
  const filter = collected.data.length === 0 ? null : and(printFilter(where.in(item.field, collected.data)), item.filter)
  return { filter, isPending: false, error: null }
}

const Loading = () => <div className="flex flex-col gap-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-4 w-full" />)}</div>

const Empty = ({ text }: { text: string | undefined }) => <p className="text-[13px] text-muted-foreground">{text ?? 'Nothing here yet.'}</p>

/**
 * A record page section listing the first records of another resource that point at this record, directly or through
 * a join resource, in the list page's table or display, with a link to them all in the list.
 */
export const RelatedSection = ({ item, recordKey, owner }: { item: RelatedModel; recordKey: string; owner: string }) => {
  const { resources, views } = useAdminMeta()
  const model = resources[item.resource]
  const view = model && views[model.name]
  const match = useMatch(item, recordKey)
  const [display, pick] = useEmbeddedDisplay(view, `related:${owner}:${item.title}`, item.display)
  if (!model) return null
  // The relation names this record on every row, so it is left out of the default columns
  const columns = item.columns ?? listColumnNames(model, view).filter((name) => name !== item.field)
  return (
    <Section title={item.title} help={item.help} actions={<EmbeddedDisplaySwitch view={view} value={display} onChange={pick} />}>
      {match.isPending ? (
        <Loading />
      ) : match.error ? (
        <ErrorBanner title="Could not load" error={match.error} />
      ) : match.filter === null || match.filter === undefined ? (
        <Empty text={item.empty} />
      ) : (
        <EmbeddedList key={match.filter} model={model} view={view} filter={match.filter} sort={item.sort ?? ''} columns={columns} limit={item.limit ?? 10} display={display} empty={item.empty} />
      )}
    </Section>
  )
}
