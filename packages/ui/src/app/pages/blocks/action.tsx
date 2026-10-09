import { useState } from 'react'
import type { ActionProps } from '@protobase/layout'
import { Button } from '../../../primitives/button'
import { ConfirmAction } from '../confirm-action'
import { useLayoutRecord } from '../record-scope'
import { useRunAction } from '../use-run-action'
import { propsOf, type BlockProps } from './block-props'

/** A button for a named action of the resource's view, asking first when the action has `confirm`. */
export const ActionBlock = ({ node }: BlockProps) => {
  const { name, resource, label, variant } = propsOf<ActionProps>(node)
  const scope = useLayoutRecord()
  const action = useRunAction(resource ?? scope?.model.name ?? '', name, resource === undefined || resource === scope?.model.name ? scope : undefined)
  const [asking, setAsking] = useState(false)
  if (!action.action) return null
  const text = label ?? action.action.label
  const start = () => (action.action!.confirm ? setAsking(true) : void action.run())
  return (
    <>
      <Button size="sm" variant={variant ?? 'secondary'} loading={action.running} disabled={Boolean(action.blocked)} title={action.blocked} onClick={start}>
        {text}
      </Button>
      {asking && (
        <ConfirmAction
          action={action.action}
          label={text}
          danger={variant === 'danger'}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false)
            void action.run()
          }}
        />
      )}
    </>
  )
}
