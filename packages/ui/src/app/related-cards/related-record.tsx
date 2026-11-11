import { ArrowRight } from 'lucide-react'
import type { ResourceModel, RowButtonModel, ViewModel } from '@protobase/schema'
import { recordKey } from '../../live/model-helpers'
import { humanize } from '../../live/naming'
import { Skeleton } from '../../primitives/skeleton'
import { ErrorBanner } from '../error-banner'
import { defaultOrderBy } from '../list-order'
import { scopeOf, useListPage } from '../pages/use-layout-data'
import { RowButtonLink } from '../row-button/row-button-link'
import { AppLink } from '../use-app-address'
import { RelatedField } from './related-field'
import { text } from './messages'

type RelatedRecordProps = {
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

/**
 * The first record a filter finds, as part of the page rather than a card: its `fields` in full, under their labels
 * when there are several and alone when there is one, then a link to its own page and `button`.
 */
export const RelatedRecord = ({ model, view, filter, sort, fields, button, empty }: RelatedRecordProps) => {
  const page = useListPage(model, { filter, sort: sort || defaultOrderBy(model, view), pageSize: 1 })
  if (page.isPending) return <Skeleton className="h-24 w-full" />
  if (page.error) return <ErrorBanner title={text('couldNotLoad')} error={page.error} />
  const row = page.data.items[0]
  if (!row) return <p className="text-muted-foreground">{empty ?? text('nothingYet')}</p>
  const scope = scopeOf(model, row)
  const singular = (view?.names?.singular ?? humanize(model.name)).toLowerCase()
  const labelled = fields.length > 1
  const shown = fields.map((path) => <RelatedField key={path} scope={scope} path={path} labelled={labelled} />)
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {labelled ? <dl className="flex flex-col gap-4">{shown}</dl> : shown}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <AppLink to={{ kind: 'record', resource: model.name, key: recordKey(model, row) }} className="flex items-center gap-1 font-medium text-primary-text hover:underline">
          {text('open', { singular })}
          <ArrowRight className="size-3.5" aria-hidden />
        </AppLink>
        {button && <RowButtonLink button={button} model={model} view={view} record={row} />}
      </div>
    </div>
  )
}
