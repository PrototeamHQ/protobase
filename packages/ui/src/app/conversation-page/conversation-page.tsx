import type { ConversationPageModel } from '@protobase/schema'
import { useOptionalAuth } from '../../auth/auth-provider'
import { useMembers } from '../../people/use-members'
import { keyValue } from '../create/create-values'
import { MessageComposer } from '../conversation/message-composer'
import { FullArea } from '../full-area-record'
import { useAdminMeta } from '../meta-gate'
import { useRecordTitle } from '../titles/record-titles'
import type { LayoutRecord } from '../pages/record-scope'
import { ConversationCall } from './conversation-call'
import { ConversationHeader } from './conversation-header'
import { ConversationMessages } from './conversation-messages'
import { matchingMembers } from './member-search'
import { ThreadPanel } from './thread-panel'
import { useReadPosition } from './use-read-position'
import { useThreadAddress } from './use-thread-address'
import { text } from './messages'
import { useRelay } from '../../relay/relay-context'
import { TypingLine } from '../../relay/typing-line'
import { useTypingSender } from '../../relay/use-typing-sender'
import { useViewChannel } from '../../relay/use-view-channel'

type Props = { page: ConversationPageModel; scope: LayoutRecord }

/**
 * A record page that is the record's conversation (`.record({ conversation })`), filling the content area: its header,
 * its messages and the box that sends one, where `@` lists the organization's members. The page does not scroll; the
 * messages scroll in a box of their own, so the box stays in view. With `typing`, a line above the box says who else
 * types, over the app's realtime relay. With threads, the thread its address names (`?thread=`) opens in a panel beside
 * it. With `call`, the record's call shows while the page joins it (`?call=join`), between the header and the messages:
 * beside them, or above them at mobile width, with a thread's panel after both, covering the screen at mobile width. Key
 * it by the record, so another one starts afresh.
 */
export const ConversationPage = ({ page, scope }: Props) => {
  const { resources, views } = useAdminMeta()
  const title = useRecordTitle()(scope.model, views[scope.model.name], scope.record, scope.key)
  const auth = useOptionalAuth()
  const me = auth?.state.kind === 'signed-in' ? auth.state.user.id : undefined
  const members = useMembers()
  const model = resources[page.resource]!
  const position = useReadPosition({ position: page.readPosition, model: page.readPosition && resources[page.readPosition.resource], owner: scope.model, recordKey: scope.key, me })
  const searchPeople = page.mentions === undefined ? undefined : async (query: string) => matchingMembers(members.data ?? [], query, me)
  const thread = useThreadAddress(scope.model.name, scope.key)
  const threaded = page.thread && { ...page, thread: page.thread }
  const channel = `${scope.model.name}/${scope.key}`
  const relay = useRelay()
  useViewChannel(channel)
  const typing = useTypingSender(channel)
  const typed = page.typing && relay ? typing : undefined
  return (
    <FullArea>
      <div className="flex min-h-0 min-w-0">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ConversationHeader page={page} scope={scope} title={title} />
          <div className="flex min-h-0 min-w-0 flex-1 max-md:flex-col">
            <ConversationCall page={page} scope={scope} />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <ConversationMessages page={page} model={model} recordKey={scope.key} me={me} position={position} threadTo={threaded && thread.to} searchPeople={searchPeople} />
              {position.error !== undefined && <p className="shrink-0 px-4 text-sm text-danger-text">{text('positionNotSaved')}</p>}
              {typed && <TypingLine channel={channel} />}
              <div className="shrink-0 px-3 pb-3">
                <MessageComposer
                  resource={page.resource}
                  field={page.text}
                  values={{ [page.field]: keyValue(scope.model, scope.key) }}
                  placeholder={page.placeholder}
                  searchPeople={searchPeople}
                  mentions={page.mentions}
                  attachments={page.attachments}
                  onDraft={typed?.onText}
                  onSent={(key) => {
                    typed?.onSent()
                    relay?.store.sent(key)
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        {threaded && thread.open !== undefined && <ThreadPanel key={thread.open} page={threaded} owner={scope.model} recordKey={scope.key} first={thread.open} me={me} searchPeople={searchPeople} onClose={thread.close} />}
      </div>
    </FullArea>
  )
}
