import { Fragment, type ReactNode } from 'react'
import { RecordScope, type ItemFrame, type LayoutRecord } from '../record-scope'
import { LayoutListScope, useLayoutList } from '../layout-list'
import { scopeOf } from '../use-layout-data'
import type { BlockProps } from './block-props'

type EachProps = {
  children: ReactNode
  /** What each entry is drawn in, such as a card of a row; nothing when omitted. */
  wrap?: (entry: ReactNode, key: string | number) => ReactNode
}

/**
 * `children` once per entry of the list around it, each in the record it is, or the item of a JSON list, which
 * `@index`, `@first` and `@last` count; the list ends there, so a list inside them is one of their own.
 */
export const RecordsEach = ({ children, wrap = (entry, key) => <Fragment key={key}>{entry}</Fragment> }: EachProps) => {
  const list = useLayoutList()
  if (!list) return null
  const { model, items } = list
  return items.map((item, index) => {
    const value: LayoutRecord | ItemFrame = model ? scopeOf(model, item as Record<string, unknown>) : { item }
    const key = 'key' in value ? value.key : index
    return wrap(
      <RecordScope value={value} row={{ index, count: items.length }}>
        <LayoutListScope value={undefined}>{children}</LayoutListScope>
      </RecordScope>,
      key,
    )
  })
}

/** Its children once per entry of the list around it, with nothing drawn around them, as react-admin's RecordsIterator. */
export const RecordsIteratorBlock = ({ children }: BlockProps) => <RecordsEach>{children}</RecordsEach>
