import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { createWhere, parseFilter, printFilter, type RelatedModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { keys } from '../data/query-keys'
import { listColumnNames } from '../live/columns-from-model'
import { Section } from '../record-view'
import { countQuery } from './pages/use-layout-data'
import { EmbeddedDisplaySwitch, EmbeddedList } from './embedded-list/embedded-list'
import { useEmbeddedDisplay } from './embedded-list/use-embedded-display'
import { RelatedCards } from './related-cards/related-cards'
import { relatedOpens } from './related-opens'
import { relatedHandOrder } from './hand-order/hand-order'
import { HandSortedList } from './hand-order/hand-sorted-list'
import { ReorderButton } from './hand-order/reorder-button'
import { useAdminMeta, usePermissions } from './meta-gate'
import { text } from './record-messages'

const where = createWhere()

// A single condition stays as it is, so the list that "View all" opens reads it as its own filter
const and = (...parts: Array<string | undefined>) => {
  const given = parts.filter((part): part is string => Boolean(part))
  return given.length === 1 ? given[0]! : given.map((part) => `(${part})`).join(' AND ')
}

/**
 * The filter on the section's resource: its `field` is this record's key, or, through a join resource, one of the keys
 * the join records that point at this record hold. `null` without a key, so nothing can match.
 */
const useMatch = (item: RelatedModel, value: string | number | boolean | null) => {
  const { resources } = useAdminMeta()
  const { through } = item
  if (value === null) return null
  if (!through) return and(printFilter(where.eq(item.field, value)), item.filter)
  const key = through.key ?? resources[through.resource]?.primaryKey[0]
  const links = parseFilter(and(printFilter(where.eq(through.field, value)), through.filter))
  if (!links.ok || !key) return null
  return and(printFilter(where.related(item.field, through.resource, key, links.ast)), item.filter)
}

const Empty = ({ empty }: { empty: string | undefined }) => <p className="text-muted-foreground">{empty ?? text('nothingYet')}</p>

/**
 * A record page section listing the first records of another resource that point at this record, directly or through
 * a join resource, in the list page's table or display, or as cards with their actions, with a link to them all in the list. When they are ordered by
 * hand within this record, **Reorder** shows them all in their order, to be moved by their drag handles.
 */
export const RelatedSection = ({ item, value, owner }: { item: RelatedModel; value: string | number | boolean | null; owner: string }) => {
  const { resources, views } = useAdminMeta()
  const model = resources[item.resource]
  const view = model && views[model.name]
  const match = useMatch(item, value)
  const [display, pick] = useEmbeddedDisplay(view, `related:${owner}:${item.title}`, item.display)
  const permissions = usePermissions(item.resource)
  const [sorting, setSorting] = useState(false)
  // Only a section that hides while empty counts its records
  const client = useClient()
  const counting = Boolean(item.hideEmpty && model && match)
  const count = useQuery({ queryKey: keys.count(item.resource, match ?? ''), enabled: counting, queryFn: () => countQuery(client, model!, match ?? '').queryFn() })
  if (!model) return null
  if (item.hideEmpty && (match === null || (counting && (count.isPending || count.data === 0)))) return null
  const opens = relatedOpens(item, model, resources)
  // The relation names this record on every row, so it is left out of the default columns
  const columns = item.columns ?? listColumnNames(model, view).filter((name) => name !== item.field)
  // What it lists, when it can match any record
  const listed = (list: (filter: string) => ReactNode) => (match === null ? <Empty empty={item.empty} /> : list(match))
  if (item.presentation === 'cards') {
    return (
      <Section title={item.title} help={item.help}>
        {listed((filter) => <RelatedCards model={model} view={view} filter={filter} sort={item.sort ?? ''} fields={columns} actions={item.actions ?? []} button={item.button} limit={item.limit ?? 10} display={item.display} empty={item.empty} />)}
      </Section>
    )
  }
  const handOrder = relatedHandOrder(item, model, permissions)
  const displaySwitch = <EmbeddedDisplaySwitch view={view} value={display} onChange={pick} />
  const actions = handOrder ? (
    <div className="flex items-center gap-2">
      {!sorting && displaySwitch}
      <ReorderButton size="sm" sorting={sorting} onChange={setSorting} />
    </div>
  ) : (
    displaySwitch
  )
  if (sorting && handOrder) {
    return (
      <Section title={item.title} help={item.help} actions={actions}>
        <HandSortedList model={model} view={view} field={handOrder} filter={printFilter(where.eq(item.field, value!))} columns={columns} />
      </Section>
    )
  }
  return (
    <Section title={item.title} help={item.help} actions={actions}>
      {listed((filter) => <EmbeddedList key={filter} model={model} view={view} filter={filter} sort={item.sort ?? ''} columns={columns} limit={item.limit ?? 10} display={display} empty={item.empty} opens={opens} button={item.button} />)}
    </Section>
  )
}
