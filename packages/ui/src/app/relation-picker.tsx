import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useList } from '../data/use-list'
import { labelFieldOf } from '../live/model-helpers'
import { humanize } from '../live/naming'
import { PickerCombobox, usePickerSearch } from './picker/picker-combobox'
import { relationOptionsQuery, titleMatches } from './relation-options'
import { text as appText } from './messages'
import { useRecordTitle } from './titles/record-titles'

export type RelationPickerProps = {
  target: ResourceModel
  view: ViewModel | undefined
  /** The chosen key, as text; empty for none. */
  value: string
  /** What to show for `value` while the box is closed. */
  label?: string
  /** The keys the list marks as chosen; `value` alone by default. */
  chosen?: string[]
  /** A choice keeps the list open and starts a new search, for picking several records. */
  several?: boolean
  invalid?: boolean
  onChange: (value: string, label: string) => void
}

/**
 * Picks a record of another resource: type to narrow the records by their search fields or title, scroll for more, and
 * choose with the mouse or with the arrow keys and Enter; Escape closes the list.
 */
export const RelationPicker = ({ target, view, value, label, chosen = [value], several = false, invalid, onChange }: RelationPickerProps) => {
  const search = usePickerSearch()
  const keyField = target.primaryKey[0]!
  const labelField = labelFieldOf(target, view)
  // The scan guard refuses a filter no index serves; the picker then narrows the records itself.
  const [refused, setRefused] = useState(false)
  // A view that derives its titles names each option for the reader, from the fields its rule reads; without search
  // fields, its options are matched by that name, which only the browser knows
  const titleOf = useRecordTitle()
  const query = relationOptionsQuery(target, labelField, search.text, refused || (view?.titleFrom !== undefined && !target.search?.length))
  const fields = [...new Set([keyField, labelField, ...(view?.titleFrom?.fields ?? [])])]
  const nameOf = (item: Record<string, unknown>) => (view?.titleFrom ? titleOf(target, view, item, String(item[keyField])) : String(item[labelField]))
  const rows = useList(target.name, { filter: query.filter, fields, enabled: search.open })
  const expensive = query.filter !== undefined && rows.error instanceof ApiError && rows.error.slug === 'expensive-query'
  useEffect(() => {
    if (expensive) setRefused(true)
  }, [expensive])
  const items = query.local ? rows.items.filter((item) => titleMatches(nameOf(item), search.text)) : rows.items
  const { fetchNextPage } = rows
  // `cancelRefetch: false` keeps a page already on its way instead of asking for it again.
  const loadMore = useCallback(() => fetchNextPage({ cancelRefetch: false }), [fetchNextPage])

  return (
    <PickerCombobox
      search={search}
      options={items.map((item) => ({ key: String(item[keyField]), label: nameOf(item) }))}
      chosen={chosen}
      several={several}
      closedText={label ?? value}
      placeholder={appText('searchPlural', { plural: (view?.names?.plural ?? humanize(target.name)).toLowerCase() })}
      invalid={invalid}
      paging={{ more: Boolean(rows.hasNextPage), loaded: rows.items.length, loadMore }}
      loading={rows.isPending || rows.isFetchingNextPage}
      failed={Boolean(rows.error) && !expensive}
      onChoose={(option) => onChange(option.key, option.label)}
    />
  )
}
