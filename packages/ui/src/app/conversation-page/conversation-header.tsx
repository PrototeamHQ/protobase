import type { ConversationPageModel } from '@protobase/schema'
import { CallMark } from '../../calls/call-mark'
import { cn } from '../../lib/cn'
import { buttonClass } from '../../primitives/button'
import type { LayoutRecord } from '../pages/record-scope'
import { AppLink } from '../use-app-address'
import { MembersTitle } from './members-title'
import { text } from './messages'

type Props = { page: ConversationPageModel; scope: LayoutRecord; title: string }

/**
 * The slim row over a conversation: the record's title, which the top bar repeats at mobile width and so shows only on
 * a wider screen, or with `members` the other people in it with their status, shown at every width; its `subtitle`
 * beside it; with `call`, the record's call, Start call or the call going on with Join; and a link to the record's
 * standard page, where its details, Edit and Delete are.
 */
export const ConversationHeader = ({ page, scope, title }: Props) => {
  const subtitle = page.subtitle === undefined ? undefined : scope.record[page.subtitle]
  const members = page.members !== undefined
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      <h1 className={cn(members ? 'flex' : 'hidden md:flex', 'min-w-0 items-center gap-2 truncate font-medium')}>{members ? <MembersTitle value={scope.record[page.members!]} fallback={title} /> : title}</h1>
      {typeof subtitle === 'string' && subtitle !== '' && <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{subtitle}</p>}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {page.call !== undefined && <CallMark resource={scope.model.name} recordKey={scope.key} />}
        <AppLink to={{ kind: 'record', resource: scope.model.name, key: scope.key, standard: true }} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
          {text('details')}
        </AppLink>
      </div>
    </div>
  )
}
