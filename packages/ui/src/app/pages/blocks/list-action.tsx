import { useState } from 'react'
import type { ActionProps } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'
import { Button } from '../../../primitives/button'
import { text } from '../../list-messages'
import { useAdminMeta } from '../../meta-gate'
import { useRecordTitle } from '../../titles/record-titles'
import { ActionPrompt, asksFirst, isDanger } from '../action-prompt'
import { scopeOf } from '../use-layout-data'
import { quoted, useActionRunner } from '../use-run-action'

type ListActionProps = Omit<ActionProps, 'resource'> & { model: ResourceModel; items: readonly unknown[]; className?: string }

/**
 * A button for a named action of `model`'s view that runs on each record of the list it sits in, as a list's selection
 * does: on those it applies to, counted in its label ("Approve (3)"), asking its question or inputs once, a checklist's
 * boxes shared by several records once, and refusing and naming those the person may not change. Nothing when the view
 * has no such action, when it is a link, or when it applies to none of the records.
 */
export const ListActionButton = ({ model, items, name, label, variant, className }: ListActionProps) => {
  const { views } = useAdminMeta()
  const runner = useActionRunner(model.name, undefined)
  const titleOf = useRecordTitle()
  const [asking, setAsking] = useState(false)
  const action = views[model.name]?.actions?.find((entry) => entry.name === name)
  if (!action || action.run?.kind === 'link') return null
  const records = items.map((item) => scopeOf(model, item as Record<string, unknown>))
  const on = records.filter((record) => runner.verdictOn(action, record) !== 'skip')
  if (on.length === 0) return null
  const skipped = records.length - on.length
  const shown = text('actionCount', { label: label ?? action.label, count: on.length })
  const run = (values?: Record<string, unknown>) => runner.runEach(action, on, skipped, values)
  const start = () => (asksFirst(action) ? setAsking(true) : void run())
  return (
    <>
      <Button size="sm" variant={variant ?? action.variant ?? 'secondary'} className={className} loading={runner.running === name} onClick={start}>
        {shown}
      </Button>
      {asking && (
        <ActionPrompt
          action={action}
          label={shown}
          danger={variant === 'danger' || (variant === undefined && isDanger(action))}
          records={on.map((record) => record.record)}
          names={on.map((record) => quoted(titleOf(model, views[model.name], record.record, record.key)))}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false)
            void run()
          }}
          onSubmit={async (values) => {
            setAsking(false)
            await run(values)
          }}
        />
      )}
    </>
  )
}
