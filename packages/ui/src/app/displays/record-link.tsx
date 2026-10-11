import type { AnchorHTMLAttributes } from 'react'
import type { KeyValue } from '@protobase/schema'
import { useLayoutRecord } from '../pages/record-scope'
import { AppLink } from '../use-app-address'
import { useOptionalListDisplay } from './display-context'
import type { ListDisplayRow } from './list-displays'

type Target = { row: ListDisplayRow; resource?: never; recordKey?: never } | { row?: never; resource?: string; recordKey: KeyValue | readonly KeyValue[] }

/**
 * A link to a record's page, through the app's addresses: a list display's `row`, or a `recordKey` of `resource`. The
 * resource defaults to the list display's or the record's around it, so a custom component never writes a path.
 */
export const RecordLink = ({ row, resource, recordKey, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & Target) => {
  const display = useOptionalListDisplay()
  const around = useLayoutRecord()
  const name = resource ?? display?.resource ?? around?.model.name
  if (name === undefined) throw new Error('RecordLink needs a resource outside a list display or a record')
  return <AppLink to={{ kind: 'record', resource: name, key: row ? row.key : recordKey }} {...rest} />
}
