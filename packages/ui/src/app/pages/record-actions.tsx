import { useState } from 'react'
import type { LiveRecord } from '../../data/use-record'
import type { ActionModel, ResourceModel } from '@protobase/schema'
import { ActionRail } from '../../record-view'
import { actionIcon } from '../action-icon'
import { useRouter } from '../router'
import { ConfirmAction } from './confirm-action'
import { useActionRunner } from './use-run-action'

/** The record page's named actions, run like the Action block runs them; deleting the record returns to the list. */
export const RecordActions = ({ model, stored, recordKey }: { model: ResourceModel; stored: LiveRecord; recordKey: string }) => {
  const { navigate } = useRouter()
  const scope = { model, record: stored.record, key: recordKey, etag: stored.etag, permissions: stored.permissions }
  const runner = useActionRunner(model.name, scope, (action) => action.run?.kind === 'delete' && navigate(`/${model.name}`, { replace: true }))
  const [asking, setAsking] = useState<ActionModel>()
  if (runner.actions.length === 0) return null
  return (
    <>
      <ActionRail
        actions={runner.actions.map((action) => ({
          name: action.label,
          icon: actionIcon(action.icon),
          blocked: runner.blocked(action),
          running: runner.running === action.name,
          onRun: () => (action.confirm ? setAsking(action) : void runner.run(action)),
        }))}
      />
      {asking && (
        <ConfirmAction
          action={asking}
          label={asking.label}
          danger={asking.run?.kind === 'delete'}
          onCancel={() => setAsking(undefined)}
          onConfirm={() => {
            setAsking(undefined)
            void runner.run(asking)
          }}
        />
      )}
    </>
  )
}
