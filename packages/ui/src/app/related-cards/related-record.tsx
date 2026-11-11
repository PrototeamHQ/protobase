import { ArrowRight } from 'lucide-react'
import type { ResourceModel, RowButtonModel, ViewModel } from '@protobase/schema'
import { useIsXs } from '../../lib/use-media-query'
import { recordKey } from '../../live/model-helpers'
import { humanize } from '../../live/naming'
import { buttonClass } from '../../primitives/button'
import { Skeleton } from '../../primitives/skeleton'
import { Section } from '../../record-view'
import { embeddedDisplay, viewAllAddress } from '../embedded-list/embedded-display'
import { text as listText } from '../embedded-list/messages'
import { ErrorBanner } from '../error-banner'
import { defaultOrderBy } from '../list-order'
import { scopeOf, useListPage } from '../pages/use-layout-data'
import { RowButtonLink } from '../row-button/row-button-link'
import { AppLink } from '../use-app-address'
import { RelatedField } from './related-field'
import { text } from './messages'

type RelatedRecordProps = {
  title: string
  help?: string
  model: ResourceModel
  view: ViewModel | undefined
  filter: string
  /** The order that picks the record, the list's own when empty. */
  sort: string
  /** The fields it shows, in full. */
  fields: string[]
  /** A button to an address the record's fields name. */
  button?: RowButtonModel
  empty?: string
}

const Empty = ({ empty }: { empty: string | undefined }) => <p className="text-muted-foreground">{empty ?? text('nothingYet')}</p>

/**
 * A record page section showing the first record a filter finds as part of the page rather than a card: its `fields`
 * in full, under their labels when there are several and alone when there is one, with a link to its own page and
 * `button` on the heading's line. A second record is read only to tell there are more, when "View all" opens them.
 */
export const RelatedRecord = ({ title, help, model, view, filter, sort, fields, button, empty }: RelatedRecordProps) => {
  const xs = useIsXs()
  const orderBy = sort || defaultOrderBy(model, view)
  const page = useListPage(model, { filter, sort: orderBy, pageSize: 2 })
  if (page.isPending) return <Section title={title} help={help}><Skeleton className="h-24 w-full" /></Section>
  if (page.error) return <Section title={title} help={help}><ErrorBanner title={text('couldNotLoad')} error={page.error} /></Section>
  const [row, next] = page.data.items
  if (!row) return <Section title={title} help={help}><Empty empty={empty} /></Section>
  const scope = scopeOf(model, row)
  const singular = (view?.names?.singular ?? humanize(model.name)).toLowerCase()
  const plural = view?.names?.plural ?? humanize(model.name)
  const labelled = fields.length > 1
  const shown = fields.map((path) => <RelatedField key={path} scope={scope} path={path} labelled={labelled} />)
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {button && <RowButtonLink button={button} model={model} view={view} record={row} />}
      <AppLink to={{ kind: 'record', resource: model.name, key: recordKey(model, row) }} className={buttonClass({ size: 'sm' })}>
        {text('open', { singular })}
      </AppLink>
    </div>
  )
  return (
    <Section title={title} help={help} actions={actions}>
      <div className="flex min-w-0 flex-col gap-4">
        {labelled ? <dl className="flex flex-col gap-4">{shown}</dl> : shown}
        {next && (
          <AppLink to={viewAllAddress(model, view, xs, { filter, orderBy, display: embeddedDisplay(view, xs, {}) })} className="flex items-center gap-1 self-start font-medium text-primary-text hover:underline">
            {listText('viewAll')} <span className="sr-only">{plural.toLowerCase()}</span>
            <ArrowRight className="size-3.5" aria-hidden />
          </AppLink>
        )}
      </div>
    </Section>
  )
}
