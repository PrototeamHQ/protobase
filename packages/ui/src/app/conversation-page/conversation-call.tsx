import type { ConversationPageModel } from '@protobase/schema'
import { RecordCall } from '../../calls/record-call'
import { useRecordCallAddress } from '../../calls/use-record-call-address'
import { useClient } from '../../data/api-provider'
import { useMembers } from '../../people/use-members'
import type { LayoutRecord } from '../pages/record-scope'

type Props = { page: ConversationPageModel; scope: LayoutRecord }

/**
 * The record's call while the page joins it (`?call=join`), on a conversation with `call`: beside the messages, or
 * above them at mobile width, half the space either way, so the box under the messages stays in view. It opens the
 * `call` function's socket with the record's key, and names the people in it after the organization's members.
 */
export const ConversationCall = ({ page, scope }: Props) => {
  const { joining } = useRecordCallAddress(scope.model.name, scope.key)
  const client = useClient()
  const members = useMembers()
  if (page.call === undefined || !joining) return null
  return (
    <div className="grid min-h-0 min-w-0 shrink-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] border-border max-md:h-1/2 max-md:border-b md:w-1/2 md:border-r">
      <RecordCall resource={scope.model.name} recordKey={scope.key} url={client.functionSocketUrl(page.call, { key: scope.key })} nameOf={(user) => members.member(user)?.name ?? user} />
    </div>
  )
}
