import { useState } from 'react'
import type { ActionModel, ResourceModel } from '@protobase/schema'
import type { BulkAction, GridRow, RowAction } from '../../data-grid'
import { actionFor } from '../pages/action-href'
import { actionLink } from '../pages/action-link'
import { isDanger } from '../pages/action-prompt'
import { ConfirmAction } from '../pages/confirm-action'
import type { LayoutRecord } from '../pages/record-scope'
import { useActionRunner } from '../pages/use-run-action'
import { useAdminMeta } from '../meta-gate'
import { useAppAddress } from '../use-app-address'
import { text } from '../list-messages'
import { rowRecord } from './row-record'

// What runs once the action's question is answered: the action on one row, or on each of a selection.
type Run = { action: ActionModel; row: LayoutRecord } | { action: ActionModel; selection: LayoutRecord[]; skipped: number }

/**
 * The named actions of `model`'s view for its list, those without inputs (which ask in a dialog of their own): each
 * in the row menu of the rows it shows for, disabled with its reason where `when` disables it, and in red when it is a
 * delete or a danger action; a link is a link there, and a disabled one a disabled item without one. Updates and handlers marked `bulk` are offered for a selection
 * while one selected row applies, and run on those that do. `prompt` is the question one asks before it runs.
 */
export const useListActions = (model: ResourceModel) => {
  const { views } = useAdminMeta()
  const runner = useActionRunner(model.name, undefined)
  const app = useAppAddress()
  const [asking, setAsking] = useState<Run>()
  const listed = (views[model.name]?.actions ?? []).filter((action) => !action.inputs?.length)
  const perform = (run: Run) => ('row' in run ? runner.run(run.action, run.row) : runner.runEach(run.action, run.selection, run.skipped))
  const start = (run: Run) => {
    if (run.action.confirm) setAsking(run)
    else void perform(run)
  }

  const rowActions = listed.map((action): RowAction => {
    const shown = (row: GridRow) => actionFor(action, rowRecord(model, row).record)
    const base = { label: (row: GridRow) => shown(row)?.label ?? action.label, destructive: isDanger(action) }
    const run = action.run
    const blocked = (row: GridRow) => runner.blockedOn(action, rowRecord(model, row))
    const available = (row: GridRow) => shown(row) !== undefined
    if (run?.kind === 'link') return { ...base, available, blocked, link: (row) => actionLink(run, rowRecord(model, row).record, app) }
    return { ...base, available, blocked, onSelect: (row) => start({ action, row: rowRecord(model, row) }) }
  })

  const bulkActions = listed
    .filter((action) => action.bulk && action.run?.kind !== 'link')
    .map((action): BulkAction => ({
      label: (count) => text('actionCount', { label: action.label, count }),
      destructive: isDanger(action),
      available: (row) => runner.appliesOn(action, rowRecord(model, row)),
      onRun: (rows, skipped) => start({ action, selection: rows.map((row) => rowRecord(model, row)), skipped }),
    }))

  const prompt = asking && (
    <ConfirmAction
      action={asking.action}
      label={asking.action.label}
      danger={isDanger(asking.action)}
      onCancel={() => setAsking(undefined)}
      onConfirm={() => {
        setAsking(undefined)
        void perform(asking)
      }}
    />
  )
  return { rowActions, bulkActions, prompt }
}
