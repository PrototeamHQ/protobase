import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { topBarButton, useTopBarSlot } from '../../app-shell'
import type { LiveRecord } from '../../data/use-record'
import type { ActionModel, AppAddress, ResourceModel } from '@protobase/schema'
import { ActionMenu, ActionRail, type RailAction } from '../../record-view'
import { RouteLink } from '../../primitives/route-link'
import { actionIcon } from '../action-icon'
import { AppLink, useAppAddress } from '../use-app-address'
import { text } from '../record-messages'
import { actionLink } from './action-link'
import { ActionPrompt, asksFirst, isDanger } from './action-prompt'
import { useActionRunner } from './use-run-action'

/**
 * The record page's actions in one rail: Edit, a link to the form at `edit`, when the page offers it; the view's named
 * actions, run like the Action block runs them, a delete among them returning to the list, a delete and a danger one in red; and the record's own Delete,
 * `onDelete`, unless a named action deletes already. On a mobile screen they sit in the top bar's menu instead, at hand
 * however long the record is, when the shell has a top bar.
 */
export const RecordActions = ({ model, stored, recordKey, edit, onDelete }: { model: ResourceModel; stored: LiveRecord; recordKey: string; edit?: AppAddress; onDelete?: () => void }) => {
  const app = useAppAddress()
  const { go } = app
  const slot = useTopBarSlot()
  const scope = { model, record: stored.record, key: recordKey, etag: stored.etag, permissions: stored.permissions }
  const runner = useActionRunner(model.name, scope, (action) => action.run?.kind === 'delete' && go({ kind: 'list', resource: model.name }, { replace: true }))
  const [asking, setAsking] = useState<ActionModel>()
  const named = runner.actions.map((action): RailAction => {
    const blocked = runner.blocked(action)
    // A link that can be followed is a link, looking as the rail's buttons do; a disabled one stays a disabled button
    const link = action.run?.kind === 'link' && !blocked ? actionLink(action.run, stored.record, app) : undefined
    return {
      name: action.label,
      icon: actionIcon(action.icon),
      blocked,
      running: runner.running === action.name,
      ...(isDanger(action) && { tone: 'danger' as const }),
      onRun: () => (asksFirst(action) ? setAsking(action) : void runner.run(action)),
      ...(link && { render: ({ className, children, role }) => <RouteLink to={link} role={role} className={className}>{children}</RouteLink> }),
    }
  })
  const deletes = runner.actions.some((action) => action.run?.kind === 'delete')
  const actions: RailAction[] = [
    ...(edit ? [{ name: text('edit'), icon: Pencil, render: ({ className, children, role }) => <AppLink to={edit} role={role} className={className}>{children}</AppLink> } satisfies RailAction] : []),
    ...named,
    ...(onDelete && !deletes ? [{ name: text('delete'), icon: Trash2, tone: 'danger' as const, onRun: onDelete }] : []),
  ]
  if (actions.length === 0) return null
  return (
    <>
      <div className={slot ? 'max-md:hidden' : undefined}>
        <ActionRail actions={actions} />
      </div>
      {slot && createPortal(<ActionMenu actions={actions} label={text('recordActions')} className={topBarButton} />, slot)}
      {asking && (
        <ActionPrompt
          action={asking}
          label={asking.label}
          danger={isDanger(asking)}
          onCancel={() => setAsking(undefined)}
          onConfirm={() => {
            setAsking(undefined)
            void runner.run(asking)
          }}
          onSubmit={async (values) => {
            await runner.submit(asking, values)
            setAsking(undefined)
          }}
        />
      )}
    </>
  )
}
