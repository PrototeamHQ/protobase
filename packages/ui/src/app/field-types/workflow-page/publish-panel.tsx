import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { WorkflowTypeList } from '@protobase/client'
import type { Definition } from '@protobase/workflows'
import { useClient } from '../../../data/api-provider'
import { keys } from '../../../data/query-keys'
import { useRecord } from '../../../data/use-record'
import { FocusPanel } from '../../../focus-page'
import { Button } from '../../../primitives/button'
import { ErrorBanner } from '../../error-banner'
import { useFocusRecord } from '../../focus/focus-record'
import { definitionOf } from '../workflow/definition'
import { triggerLabel, triggerType } from '../workflow/labels'
import type { WorkflowPage } from './use-workflow-page'
import { versionDiff } from './version-diff'
import { workflowsResource, type WorkflowView } from './workflow-view'
import { text } from './messages'

export type PublishPanelProps = {
  view: WorkflowView
  page: WorkflowPage
  /** The definition shown, which is what publishes. */
  definition: Definition
  types: WorkflowTypeList
  onClose: () => void
}

// Writes the published version, read fresh so a save just made counts, and shows the bar what is live now
const usePublish = (workflow: string) => {
  const client = useClient()
  const queryClient = useQueryClient()
  return async (version: number | null) => {
    await client.update(workflowsResource, workflow, { enabled_version: version }, '*')
    await queryClient.invalidateQueries({ queryKey: keys.record(workflowsResource, workflow) })
  }
}

/** Publish in the end panel, always asked: what goes live, what changes, and what happens to a trigger, or going back to an older version. */
export const PublishPanel = ({ view, page, definition, types, onClose }: PublishPanelProps) => {
  const focus = useFocusRecord()!
  const client = useClient()
  const publish = usePublish(view.workflow)
  const [failure, setFailure] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState(false)
  const unsaved = view.version === undefined && focus.dirty
  const version = view.version ?? (page.latest ?? 0) + (unsaved ? 1 : 0)
  const { enabled, latest } = page
  const live = useRecord('workflow_versions', [view.workflow, enabled ?? 0], enabled !== undefined)
  const rollback = !unsaved && latest !== undefined && version < latest
  const tested = page.runs.some((run) => Number(run.version) === version)
  const diff = live.data ? versionDiff(definitionOf(live.data.record.definition), definition) : undefined
  const trigger = triggerType(definition.trigger)
  const run = async () => {
    setBusy(true)
    setRefused(false)
    setFailure(undefined)
    if (unsaved && !(await focus.save())) {
      setBusy(false)
      setRefused(true)
      return
    }
    const target = view.version ?? Number((await client.get(workflowsResource, view.workflow)).record.version)
    await publish(target).then(onClose, setFailure)
    setBusy(false)
  }
  const label = unsaved ? text('saveAndPublish') : enabled === undefined && trigger !== 'manual' ? text('publishAndTurnOn') : text('publishVersion', { version })
  return (
    <FocusPanel title={rollback ? text('goBackTo', { version }) : text('publishVersion', { version })} onClose={onClose} takesFocus>
      <div className="flex flex-col gap-3 text-body">
        {failure !== undefined && <ErrorBanner title={text('notPublished')} error={failure} />}
        {refused && <p role="alert" className="text-danger-text">{text('notPublishedSave')}</p>}
        {unsaved && <p>{text('savesThenPublishes', { version })}</p>}
        {rollback && <p>{text('rollback', { latest, version })}</p>}
        {!rollback && enabled !== undefined && <p>{text('publishChange', { live: enabled, version })}</p>}
        {enabled === undefined && (trigger === 'manual' ? <p>{text('publishManual', { version })}</p> : <p>{text('startsTrigger', { trigger: triggerLabel(definition.trigger, types) })}</p>)}
        {diff && <p className="text-muted-foreground">{text('publishDiff', { ...diff, version: enabled ?? 0 })}</p>}
        {!tested && <p className="text-warning-text">{text('untested', { version })}</p>}
        <Button variant="primary" className="max-md:min-h-11" loading={busy} onClick={() => void run()}>
          {label}
        </Button>
      </div>
    </FocusPanel>
  )
}

/** Turning a workflow off in the end panel: its trigger stops, and what runs stays on its version. */
export const TurnOffPanel = ({ view, onClose }: { view: WorkflowView; onClose: () => void }) => {
  const publish = usePublish(view.workflow)
  const [failure, setFailure] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    await publish(null).then(onClose, setFailure)
    setBusy(false)
  }
  return (
    <FocusPanel title={text('turnOffTitle')} onClose={onClose} takesFocus>
      <div className="flex flex-col gap-3 text-body">
        {failure !== undefined && <ErrorBanner title={text('notTurnedOff')} error={failure} />}
        <p>{text('turnOffLine')}</p>
        <Button variant="danger" className="max-md:min-h-11" loading={busy} onClick={() => void run()}>
          {text('turnOff')}
        </Button>
      </div>
    </FocusPanel>
  )
}
