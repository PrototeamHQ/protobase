import { useState } from 'react'
import type { ActionProps } from '@protobase/layout'
import { Button } from '../../../primitives/button'
import { ActionPrompt, asksFirst } from '../action-prompt'
import { useLayoutRecord } from '../record-scope'
import { useRunAction } from '../use-run-action'
import { propsOf, type BlockProps } from './block-props'

/**
 * A button for a named action of `resource`'s view, by default of the record around it, on that record, asking first
 * when the action has `confirm` or `inputs`; nothing when the view has no such action for the user, or none for the
 * record. It is drawn as the action's `variant` unless the block names its own. `about` names the record in the
 * button's accessible name after its label, as "Mark clear: <title>", where the same button repeats for several records.
 * `onRun` hears the label it shows once the action succeeded.
 */
export const ActionButton = ({ name, resource, label, variant, className, about, onRun }: ActionProps & { className?: string; about?: string; onRun?: (label: string) => void }) => {
  const scope = useLayoutRecord()
  const action = useRunAction(resource ?? scope?.model.name ?? '', name, resource === undefined || resource === scope?.model.name ? scope : undefined, (ran) => onRun?.(label ?? ran.label))
  const [asking, setAsking] = useState(false)
  if (!action.action) return null
  const text = label ?? action.action.label
  // The block's own variant wins over the action's
  const shown = variant ?? action.action.variant ?? 'secondary'
  const start = () => (asksFirst(action.action!) ? setAsking(true) : void action.run())
  return (
    <>
      <Button size="sm" variant={shown} className={className} loading={action.running} disabled={Boolean(action.blocked)} title={action.blocked} aria-label={about === undefined ? undefined : `${text}: ${about}`} onClick={start}>
        {text}
      </Button>
      {asking && (
        <ActionPrompt
          action={action.action}
          label={text}
          danger={shown === 'danger'}
          records={action.record ? [action.record] : []}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false)
            void action.run()
          }}
          onSubmit={async (values) => {
            await action.submit(values)
            setAsking(false)
          }}
        />
      )}
    </>
  )
}

/** An Action block: its button. */
export const ActionBlock = ({ node, className }: BlockProps) => <ActionButton {...propsOf<ActionProps>(node)} className={className} />
