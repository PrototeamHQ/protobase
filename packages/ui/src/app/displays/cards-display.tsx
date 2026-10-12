import type { ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import { toneFor } from '../../live/columns-from-model'
import { displayValue } from '../../live/display-value'
import { humanize } from '../../live/naming'
import { Badge } from '../../primitives/badge'
import { Skeleton } from '../../primitives/skeleton'
import { AppLink } from '../use-app-address'
import { shownWidget } from '../field-types/shown-widget'
import { WidgetPart } from '../field-types/widget-part'
import { CustomBoundary } from '../pages/custom-boundary'
import { useProjectUi } from '../pages/project-ui'
import type { ListDisplay } from './display-context'
import { DisplayFooter, DisplayState } from './display-frame'
import { cardFields, type ListDisplayRow } from './list-displays'

type CardsProps = { model: ResourceModel; view: ViewModel | undefined; display: Extract<ListDisplayModel, { kind: 'cards' }>; list: ListDisplay }

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3'

/**
 * A card per record, opening its page: the title over the subtitle, the badge beside it and small meta fields below;
 * or, with a `card` component, what it draws of the row, the built-in content again when it is missing or throws.
 */
export const CardsDisplay = ({ model, view, display, list }: CardsProps) => {
  const { title, subtitle, badge, meta } = cardFields(model, view, display)
  const label = (name: string) => view?.fields[name]?.label ?? humanize(name)
  const text = (row: ListDisplayRow, name: string) => {
    const field = model.fields[name]
    if (!field) return ''
    return row.labels[name] ?? displayValue(field, row.record[name], view?.fields[name])
  }
  // A field the view shows with a field type draws its display
  const { fields: fieldTypes, components } = useProjectUi()
  const Card = display.card === undefined ? undefined : components?.[display.card]
  const shownValue = (row: ListDisplayRow, name: string) => {
    const field = model.fields[name]
    const shown = field && shownWidget(fieldTypes, field, view?.fields[name])
    return shown ? <WidgetPart shown={shown} part="display" field={field} value={row.record[name]} fallback={text(row, name)} /> : text(row, name)
  }
  const plural = (view?.names?.plural ?? humanize(model.name)).toLowerCase()

  return (
    <DisplayState list={list} empty={`No ${plural} match.`} loading={<div className={grid}>{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div>}>
      <ul className={grid} aria-label={view?.names?.plural ?? humanize(model.name)}>
        {list.rows.map((row) => {
          const status = badge === undefined ? undefined : row.record[badge]
          const builtIn = (
            <>
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{shownValue(row, title)}</span>
                {badge !== undefined && status !== null && status !== undefined && <Badge tone={toneFor(String(status))}>{text(row, badge)}</Badge>}
              </span>
              {subtitle !== undefined && <span className="truncate text-muted-foreground">{shownValue(row, subtitle)}</span>}
              {meta.length > 0 && (
                <dl className="mt-auto flex flex-wrap gap-x-3 gap-y-0.5 pt-1 text-xs text-muted-foreground">
                  {meta.map((name) => (
                    <div key={name} className="flex gap-1">
                      <dt className="sr-only">{label(name)}</dt>
                      <dd className="tabular-nums">{shownValue(row, name)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          )
          return (
            <li key={row.key}>
              <AppLink
                to={{ kind: 'record', resource: model.name, key: row.key }}
                className="flex h-full flex-col gap-1.5 rounded-lg border border-border bg-background p-3 text-[13px] hover:border-border-strong hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {Card ? (
                  <CustomBoundary name={display.card!} fallback={builtIn}>
                    <Card row={row} />
                  </CustomBoundary>
                ) : (
                  builtIn
                )}
              </AppLink>
            </li>
          )
        })}
      </ul>
      <DisplayFooter list={list} />
    </DisplayState>
  )
}
