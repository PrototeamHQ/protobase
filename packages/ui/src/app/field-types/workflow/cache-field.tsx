import { useState } from 'react'
import type { WorkflowTypeList } from '@protobase/client'
import type { TaskState } from '@protobase/workflows'
import { Button } from '../../../primitives/button'
import { Dialog } from '../../../primitives/dialog'
import { Switch } from '../../../primitives/switch'
import { Field } from '../../../record-view/field'
import { cacheSwitch } from './cache-advice'
import { text } from './messages'

type CacheFieldProps = { state: TaskState; types: WorkflowTypeList; disabled?: boolean; onChange: (state: TaskState) => void }

const withCache = (state: TaskState, cache: boolean | undefined): TaskState => {
  const { Cache: _, ...rest } = state
  return cache === undefined ? rest : { ...rest, Cache: cache }
}

/**
 * A Task's cache switch, as its step type's advice offers it: none for a type that hides it; forcing it on for a type
 * that advises against it first shows the type's disclaimer.
 */
export const CacheField = ({ state, types, disabled, onChange }: CacheFieldProps) => {
  const [asking, setAsking] = useState(false)
  const offered = cacheSwitch(state, types)
  if (!offered) return null
  const toggle = (on: boolean) => {
    if (disabled) return
    if (!on) return onChange(withCache(state, offered.offValue))
    if (offered.disclaimer) return setAsking(true)
    onChange(withCache(state, true))
  }
  return (
    <>
      <Field label={text('cacheResults')} help={text(offered.forces ? 'cacheForceHelp' : 'cacheHelp')}>
        <Switch checked={offered.on} onChange={toggle} />
      </Field>
      {asking && (
        <Dialog
          title={text('cacheConfirmTitle')}
          description={offered.disclaimer}
          onClose={() => setAsking(false)}
          actions={
            <>
              <Button onClick={() => setAsking(false)}>{text('cacheCancel')}</Button>
              <Button variant="primary" onClick={() => (setAsking(false), onChange(withCache(state, true)))}>
                {text('cacheConfirm')}
              </Button>
            </>
          }
        />
      )}
    </>
  )
}
