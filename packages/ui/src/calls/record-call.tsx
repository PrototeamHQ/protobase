import { CallView, type CallViewProps } from './call-view'
import { useRecordCallAddress } from './use-record-call-address'

export type RecordCallProps = Omit<CallViewProps, 'leave'> & { resource: string; recordKey: string }

/**
 * The record's call view while the app's address joins it (`call=join`, as Accept and Join open it), and nothing
 * otherwise: put it beside the record's own content, such as on a full-area record page. Leave goes back to the record.
 */
export const RecordCall = ({ resource, recordKey, ...rest }: RecordCallProps) => {
  const { joining, leave } = useRecordCallAddress(resource, recordKey)
  if (!joining) return null
  return <CallView key={`${resource}/${recordKey}`} leave={leave} {...rest} />
}
