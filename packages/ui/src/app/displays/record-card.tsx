import type { ReactNode } from 'react'
import type { KeyValue, ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import { displayValue } from '../../live/display-value'
import { jsonSummary } from '../../live/json-summary'
import { linkTextOf } from '../../live/link-text'
import { recordKey } from '../../live/model-helpers'
import { humanize } from '../../live/naming'
import { Badge } from '../../primitives/badge'
import { CodeBlock } from '../../primitives/code-block'
import { AppLink } from '../use-app-address'
import { useSeedRecord } from '../record-preview'
import { shownWidget } from '../field-types/shown-widget'
import { WidgetPart } from '../field-types/widget-part'
import { namedIcon } from '../named-icon'
import { useAdminMeta } from '../meta-gate'
import { RelationTitleText } from '../titles/relation-title-text'
import { CustomBoundary } from '../pages/custom-boundary'
import { FavoriteButton } from '../saved/favorite-button'
import { useProjectUi } from '../pages/project-ui'
import { ValueBadge } from '../value-badge'
import { CardDots, CardDotsRoom } from '../related-dots/card-dots'
import { cardDotsLines } from '../related-dots/card-dots-lines'
import { CardCarousel } from './card-carousel'
import { CardImage } from './card-image'
import { Markdown } from '../../markdown/markdown'
import { markdownExcerpt } from '../../markdown/markdown-excerpt'
import { isMarkdown } from '../../markdown/markdown-hint'
import { amountParts, cardFields, filledAmount, filledCode, filledMeta, rawCode, type ListDisplayRow } from './list-displays'
import { text as message } from './messages'

type RecordCardProps = {
  model: ResourceModel
  view: ViewModel | undefined
  display: Extract<ListDisplayModel, { kind: 'cards' }>
  row: ListDisplayRow
  /** Whether a swipe steps through the card's photos; off in a row that scrolls sideways, which the swipe scrolls instead. */
  swipe?: boolean
  /** A word marked in the card's top left corner, such as "New": over its picture, or above its title without one. */
  mark?: string
}

// A meta field's value after the icon its view names.
const MetaValue = ({ icon, children }: { icon: string | undefined; children: ReactNode }) => {
  const Icon = namedIcon(icon)
  return (
    <dd className="flex items-center gap-1 tabular-nums">
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      {children}
    </dd>
  )
}

/**
 * A record's card of a cards display, opening its page: its image across the top, swiped or stepped through its photos
 * when the display names them, the title over the subtitle, the badge beside it, the first amount with a value in bold,
 * small meta fields below, those with a value, the labels of its flags that are true, the footer's fields with a
 * value, joined by bullets, and a line of dots for each related column of the list it names; or, with a `card`
 * component, what it draws of the row, the built-in content again when it is missing or throws. With a favorite button, a heart in the top right corner saves the record.
 */
export const RecordCard = ({ model, view, display, row, swipe = true, mark }: RecordCardProps) => {
  const { image, title, subtitle, amount, badge, code, meta, footer, flags } = cardFields(model, view, display)
  const label = (name: string) => view?.fields[name]?.label ?? humanize(name)
  const { resources, views } = useAdminMeta()
  const text = (name: string): ReactNode => {
    const field = model.fields[name]
    if (!field) return ''
    const value = row.record[name]
    // A relation to a resource whose view derives its titles names its record for the reader
    const target = field.type === 'relation' && field.relation ? resources[field.relation.resource] : undefined
    if (target && views[target.name]?.titleFrom && value != null) return <RelationTitleText target={target} id={String(value)} />
    // Markdown reads as its text on a card's one-line parts
    if (row.labels[name] === undefined && isMarkdown(field, view?.fields[name]) && typeof value === 'string' && value !== '') return markdownExcerpt(value)
    // JSON reads as its summary there, as in a table cell
    if (field.type === 'json' && value != null) return jsonSummary(value)
    // A url reads as its link text, when the view gives one, as the address alone says little
    if (view?.fields[name]?.format === 'url' && typeof value === 'string' && value !== '') return linkTextOf(model, view, name, row.record) ?? value
    return row.labels[name] ?? displayValue(field, value, view?.fields[name])
  }
  // A field the view shows with a field type draws its display
  const { fields: fieldTypes, components } = useProjectUi()
  const seedRecord = useSeedRecord(model)
  const Card = display.card === undefined ? undefined : components?.[display.card]
  const shownValue = (name: string) => {
    const field = model.fields[name]
    const shown = field && shownWidget(fieldTypes, field, view?.fields[name])
    return shown ? <WidgetPart shown={shown} part="display" field={field} value={row.record[name]} fallback={text(name)} /> : text(name)
  }
  // A markdown subtitle shows rendered, its links as text inside the card's own link
  const subtitleValue = (name: string) => {
    const field = model.fields[name]
    const value = row.record[name]
    if (!field || !isMarkdown(field, view?.fields[name]) || shownWidget(fieldTypes, field, view?.fields[name]) || typeof value !== 'string' || value === '') return shownValue(name)
    return <Markdown source={value} inLink />
  }
  // A meta field the view formats as a badge shows as one, unless a field type draws it
  const metaValue = (name: string) => {
    const field = model.fields[name]
    const hints = view?.fields[name]
    const value = row.record[name]
    if (!field || hints?.format !== 'badge' || shownWidget(fieldTypes, field, hints) || value === null || value === undefined || value === '') return shownValue(name)
    return (
      <ValueBadge value={value} hints={hints}>
        {text(name)}
      </ValueBadge>
    )
  }
  // The amount in bold, its suffix such as ` /month` not; a relation's name or a field type's display in bold whole
  const amountValue = (name: string) => {
    const field = model.fields[name]
    if (!field) return undefined
    if (row.labels[name] !== undefined || shownWidget(fieldTypes, field, view?.fields[name])) return <strong className="font-semibold text-foreground">{shownValue(name)}</strong>
    const parts = amountParts(field, row.record[name], view?.fields[name])
    return (
      <>
        <strong className="font-semibold text-foreground">{parts.amount}</strong>
        {parts.suffix}
      </>
    )
  }
  // A card component draws its own content, so only the built-in card steps through photos
  const photos = Card ? undefined : display.photos
  const status = badge === undefined ? undefined : row.record[badge]
  const raised = flags.filter((name) => row.record[name] === true)
  const cover = image === undefined ? undefined : row.record[image]
  const shownAmount = filledAmount(row, amount)
  const shownCode = filledCode(row, code)
  const footing = filledMeta(row, footer)
  const pictured = image !== undefined || photos !== undefined
  // The heart sits over the picture, or beside the title, which leaves it room
  const favorite = display.favorite
  // A card component draws its own content, so only the built-in card shows the list's dots
  const dots = Card ? [] : cardDotsLines(view, display, row)
  // The card's one link is its title, stretched over the whole card, so a screen reader reads the card as one link named
  // by its title and the rest as text
  const link = (className: string, children: ReactNode) => (
    <AppLink
      to={{ kind: 'record', resource: model.name, key: row.key }}
      onClick={() => seedRecord(row.record)}
      data-card-link
      className={`${className} after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-hidden`}
    >
      {children}
    </AppLink>
  )
  const builtIn = (picture: ReactNode, linked: boolean) => (
    <>
      {pictured && picture}
      <span className={`flex items-start justify-between gap-2 ${favorite && !pictured ? 'pr-8' : ''}`}>
        {linked ? link('min-w-0 truncate font-medium', shownValue(title)) : <span className="min-w-0 truncate font-medium">{shownValue(title)}</span>}
        {badge !== undefined && status !== null && status !== undefined && (
          <ValueBadge value={status} hints={view?.fields[badge]}>
            {text(badge)}
          </ValueBadge>
        )}
      </span>
      {subtitle !== undefined && (
        // A text of several lines keeps its first three, line breaks and all, and markdown its first three rendered
        <span className={view?.fields[subtitle]?.markdown ? 'line-clamp-3 break-words text-muted-foreground' : view?.fields[subtitle]?.multiline ? 'line-clamp-3 whitespace-pre-line break-words text-muted-foreground' : 'truncate text-muted-foreground'}>{subtitleValue(subtitle)}</span>
      )}
      {shownAmount !== undefined && <span className="truncate tabular-nums text-muted-foreground">{amountValue(shownAmount)}</span>}
      {shownCode !== undefined && <CodeBlock>{rawCode(model.fields[shownCode], row.record[shownCode]) ?? text(shownCode)}</CodeBlock>}
      {meta.length > 0 && (
        <dl className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-1 text-xs text-muted-foreground">
          {filledMeta(row, meta).map((name) => (
            <div key={name} className="flex gap-1">
              <dt className="sr-only">{label(name)}</dt>
              <MetaValue icon={view?.fields[name]?.icon}>{metaValue(name)}</MetaValue>
            </div>
          ))}
        </dl>
      )}
      {raised.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label={message('features')}>
          {raised.map((name) => (
            <li key={name}>
              <Badge dot={false}>{label(name)}</Badge>
            </li>
          ))}
        </ul>
      )}
      {footing.length > 0 && (
        <span className={`truncate text-xs text-muted-foreground ${meta.length > 0 ? '' : 'mt-auto'}`}>
          {footing.map((name, index) => (
            <span key={name}>
              {index > 0 && <span aria-hidden> • </span>}
              {shownValue(name)}
            </span>
          ))}
        </span>
      )}
      {dots.length > 0 && <CardDotsRoom dots={dots} />}
    </>
  )
  // Isolated, so what sits beside the card in the document, such as the photo arrows and the heart, stays over its link
  const card = (picture: ReactNode) => (
    <div className="relative isolate flex h-full flex-col gap-1.5 rounded-lg border border-border bg-background p-3 hover:border-border-strong hover:bg-surface has-[[data-card-link]:focus-visible]:ring-2 has-[[data-card-link]:focus-visible]:ring-primary/30">
      {mark && !pictured && (
        <Badge tone="blue" className="self-start">
          {mark}
        </Badge>
      )}
      {Card ? (
        <>
          {/* A drawn card's content is not known to hold the title, so the link over it is named by the title unseen */}
          {link('absolute inset-0', <span className="sr-only">{shownValue(title)}</span>)}
          <CustomBoundary name={display.card!} fallback={builtIn(picture, false)}>
            <Card row={row} />
          </CustomBoundary>
        </>
      ) : (
        builtIn(picture, true)
      )}
    </div>
  )
  return (
    <div className={photos ? 'group/card relative h-full' : favorite || mark || dots.length > 0 ? 'relative h-full' : 'h-full'}>
      {photos ? (
        // A card drawn for another record, as the map's chosen card is, starts again at that record's first photo
        <CardCarousel key={row.key} photos={row.photos ?? []} cover={cover} swipe={swipe}>
          {(picture) =>
            card(
              // The photos sit over the title's link, so a swipe moves them; a tap opens the record through a link of their
              // own, which a screen reader skips as the title's says the same
              <AppLink to={{ kind: 'record', resource: model.name, key: row.key }} onClick={() => seedRecord(row.record)} tabIndex={-1} aria-hidden className="relative z-[1] block">
                {picture}
              </AppLink>,
            )
          }
        </CardCarousel>
      ) : (
        card(<CardImage value={cover} />)
      )}
      {mark && pictured && (
        <Badge tone="blue" className="pointer-events-none absolute top-2 left-2 shadow-sm">
          {mark}
        </Badge>
      )}
      {dots.length > 0 && <CardDots dots={dots} Card={RecordCard} />}
      {favorite && <FavoriteButton favorite={favorite} recordKey={row.key} target={recordKey(model, row.record) as KeyValue} className={pictured ? undefined : 'right-1.5 top-1.5'} />}
    </div>
  )
}
