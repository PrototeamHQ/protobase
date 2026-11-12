import { useState } from 'react'
import type { ActionModel, ResourceModel } from '@protobase/schema'
import type { BulkAction, GridRow, RowAction } from '../../data-grid'
import { actionFor } from '../pages/action-href'
import { actionLink } from '../pages/action-link'
import { ActionPrompt, isDanger } from '../pages/action-prompt'
import type { LayoutRecord } from '../pages/record-scope'
import { quoted, useActionRunner } from '../pages/use-run-action'
import { useRecordTitle } from '../titles/record-titles'
import { useAdminMeta } from '../meta-gate'
import { useAppAddress } from '../use-app-address'
import { text } from '../list-messages'
import { rowRecord } from './row-record'

// What runs once the action's question is answered: the action on one row, or on each of a selection.
type Run = { action: ActionModel; row: LayoutRecord } | { action: ActionModel; selection: LayoutRecord[]; skipped: number }
// A run whose dialog is open, with how to report the records it leaves open once it ends.
type Asking = Run & { settle: (open: LayoutRecord[] | Promise<LayoutRecord[]>) => void }

/**
 * The named actions of `model`'s view for its list: those without inputs each in the row menu of the rows it shows for,
 * disabled with its reason where `when` disables it, and in red when it is a delete or a danger action; a link is a link
 * there, and a disabled one a disabled item without one. Updates and handlers marked `bulk` are offered for a selection
 * while one selected row applies, ask their question or inputs once, and run on those that do, refusing and naming
 * those the person may not change, which stay selected. `prompt` is the dialog one opens before it runs.
 */
export const useListActions = (model: ResourceModel) => {
  const { views, resources } = useAdminMeta()
  const runner = useActionRunner(model.name, undefined)
  const app = useAppAddress()
  const titleOf = useRecordTitle()
  const [asking, setAsking] = useState<Asking>()
  const named = views[model.name]?.actions ?? []
  const listed = named.filter((action) => !action.inputs?.length)
  // Resolves to the records the run leaves open, those it was refused on
  const perform = async (run: Run, values?: Record<string, unknown>) => {
    if ('row' in run) {
      await runner.run(run.action, run.row)
      return []
    }
    const outcome = await runner.runEach(run.action, run.selection, run.skipped, values)
    return outcome.refused
  }
  // Resolves once the run ended to the records it leaves open: all of them when its dialog is cancelled
  const start = (run: Run) =>
    new Promise<LayoutRecord[]>((settle) => {
      if (run.action.confirm || run.action.inputs?.length) setAsking({ ...run, settle })
      else settle(perform(run))
    })

  const rowActions = listed.map((action): RowAction => {
    const shown = (row: GridRow) => actionFor(action, rowRecord(model, row).record, resources)
    const base = { label: (row: GridRow) => shown(row)?.label ?? action.label, destructive: isDanger(action) }
    const run = action.run
    const blocked = (row: GridRow) => runner.blockedOn(action, rowRecord(model, row))
    const available = (row: GridRow) => shown(row) !== undefined
    if (run?.kind === 'link') return { ...base, available, blocked, link: (row) => actionLink(run, rowRecord(model, row).record, app) }
    return { ...base, available, blocked, onSelect: (row) => void start({ action, row: rowRecord(model, row) }) }
  })

  const bulkActions = named
    .filter((action) => action.bulk && action.run?.kind !== 'link')
    .map((action): BulkAction => ({
      label: (count) => text('actionCount', { label: action.label, count }),
      destructive: isDanger(action),
      available: (row) => runner.verdictOn(action, rowRecord(model, row)) !== 'skip',
      onRun: async (rows, skipped) => {
        const selection = rows.map((row) => rowRecord(model, row))
        const open = await start({ action, selection, skipped })
        return rows.filter((_, index) => open.includes(selection[index]!))
      },
    }))

  const prompt = asking && (
    <ActionPrompt
      action={asking.action}
      label={'row' in asking ? asking.action.label : text('actionCount', { label: asking.action.label, count: asking.selection.length })}
      danger={isDanger(asking.action)}
      records={'row' in asking ? [asking.row.record] : asking.selection.map((on) => on.record)}
      names={'row' in asking ? [] : asking.selection.map((on) => quoted(titleOf(model, views[model.name], on.record, on.key)))}
      onCancel={() => {
        setAsking(undefined)
        asking.settle('row' in asking ? [asking.row] : asking.selection)
      }}
      onConfirm={() => {
        setAsking(undefined)
        asking.settle(perform(asking))
      }}
      onSubmit={async (values) => {
        setAsking(undefined)
        const running = perform(asking, values)
        asking.settle(running)
        await running
      }}
    />
  )
  return { rowActions, bulkActions, prompt }
}
