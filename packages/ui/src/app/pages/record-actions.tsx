import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { LiveRecord } from '../../data/use-record'
import type { ActionModel, AppAddress, ResourceModel } from '@protobase/schema'
import { ActionRail, type RailAction } from '../../record-view'
import { actionIcon } from '../action-icon'
import { AppLink, useAppAddress } from '../use-app-address'
import { ActionPrompt, asksFirst } from './action-prompt'
import { useActionRunner } from './use-run-action'

/**
 * The record page's actions in one rail: Edit, a link to the form at `edit`, when the page offers it; the view's named
 * actions, run like the Action block runs them, a delete among them returning to the list; and the record's own Delete,
 * `onDelete`, unless a named action deletes already.
 */
export const RecordActions = ({ model, stored, recordKey, edit, onDelete }: { model: ResourceModel; stored: LiveRecord; recordKey: string; edit?: AppAddress; onDelete?: () => void }) => {
  const { go } = useAppAddress()
  const scope = { model, record: stored.record, key: recordKey, etag: stored.etag, permissions: stored.permissions }
  const runner = useActionRunner(model.name, scope, (action) => action.run?.kind === 'delete' && go({ kind: 'list', resource: model.name }, { replace: true }))
  const [asking, setAsking] = useState<ActionModel>()
  const named = runner.actions.map((action): RailAction => ({
    name: action.label,
    icon: actionIcon(action.icon),
    blocked: runner.blocked(action),
    running: runner.running === action.name,
    ...(action.run?.kind === 'delete' && { tone: 'danger' as const }),
    onRun: () => (asksFirst(action) ? setAsking(action) : void runner.run(action)),
  }))
  const deletes = runner.actions.some((action) => action.run?.kind === 'delete')
  const actions: RailAction[] = [
    ...(edit ? [{ name: 'Edit', icon: Pencil, render: ({ className, children }) => <AppLink to={edit} className={className}>{children}</AppLink> } satisfies RailAction] : []),
    ...named,
    ...(onDelete && !deletes ? [{ name: 'Delete', icon: Trash2, tone: 'danger' as const, onRun: onDelete }] : []),
  ]
  if (actions.length === 0) return null
  return (
    <>
      <ActionRail actions={actions} />
      {asking && (
        <ActionPrompt
          action={asking}
          label={asking.label}
          danger={asking.run?.kind === 'delete'}
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
