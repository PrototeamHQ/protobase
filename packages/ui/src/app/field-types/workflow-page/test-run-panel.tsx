import { useState } from 'react'
import type { WorkflowTypeList } from '@protobase/client'
import type { Definition } from '@protobase/workflows'
import { useClient } from '../../../data/api-provider'
import { FocusPanel } from '../../../focus-page'
import { formatDateTime } from '../../../format/date'
import { Textarea } from '../../../primitives/textarea'
import { Field } from '../../../record-view/field'
import { InPlaceForm } from '../../create/in-place-form'
import { useCreateForm } from '../../create/use-create-form'
import { useFocusRecord } from '../../focus/focus-record'
import { useAppAddress } from '../../use-app-address'
import { jsonProblem } from './json-problem'
import { stepsThatAct } from './run-effects'
import type { WorkflowPage } from './use-workflow-page'
import { useRunStatus } from './use-run-status'
import { runAddress, workflowsResource, type WorkflowView } from './workflow-view'
import { text } from './messages'

const written = (value: unknown) => JSON.stringify(value ?? {}, null, 2)

/** Where a test run's input came from, when it was not typed: the value and what to say about it. */
export type TestSeed = { value: unknown; from: string }

export type TestRunPanelProps = {
  view: WorkflowView
  page: WorkflowPage
  /** The definition shown, which a run of it follows. */
  definition: Definition
  types: WorkflowTypeList
  seed?: TestSeed | undefined
  onClose: () => void
}

/**
 * Test run in the end panel: the input, from an earlier run or typed, what running it does, and Start run, which saves
 * unsaved changes first, since a save changes nothing that is live, and then shows the run on the graph.
 */
export const TestRunPanel = ({ view, page, definition, types, seed, onClose }: TestRunPanelProps) => {
  const focus = useFocusRecord()!
  const client = useClient()
  const { go } = useAppAddress()
  const status = useRunStatus()
  const earlier = page.runs.filter((run) => run.input != null).slice(0, 5)
  const [input, setInput] = useState(() => written(seed ? seed.value : earlier[0]?.input))
  const [refused, setRefused] = useState(false)
  const form = useCreateForm({
    resource: 'workflow_runs',
    feedback: 'button',
    onCreated: (record) => {
      if (!record) return
      onClose()
      // A save just made is not in `page` yet: without a version shown, the run is on the latest
      go(runAddress(view.workflow, String(record.id), Number(record.version), view.version === undefined ? Number(record.version) : page.latest))
    },
  })
  const problem = jsonProblem(input)
  const unsaved = view.version === undefined && focus.dirty
  const version = view.version ?? page.latest ?? 0
  const start = async () => {
    setRefused(false)
    if (unsaved && !(await focus.save())) return setRefused(true)
    // The version a save just made is the workflow's latest, which only the server knows yet
    const latest = view.version ?? Number((await client.get(workflowsResource, view.workflow)).record.version)
    await form.submit({ workflow_id: view.workflow, input: JSON.parse(input), version: latest })
  }
  const acting = stepsThatAct(definition, types)
  // The moment the panel opened the keyboard is in the box, as most runs start from the input already there
  return (
    <FocusPanel title={text('testRun')} onClose={onClose} takesFocus>
      <InPlaceForm form={form} fields={[]} submit={unsaved ? text('saveAndStart') : text('startRun')} disabled={problem !== undefined} onSubmit={() => void start()}>
        <p className="text-xs text-muted-foreground">{seed ? seed.from : earlier[0] ? text('inputOfRun', { when: formatDateTime(Date.parse(String(earlier[0].created_at))) }) : text('noRunInput')}</p>
        <Field label={text('inputJson')} error={problem}>
          <Textarea rows={8} className="font-mono text-xs" value={input} invalid={problem !== undefined} onChange={(event) => setInput(event.target.value)} />
        </Field>
        {earlier.length > 0 && (
          <div className="grid gap-1">
            <p className="text-xs font-medium text-muted-foreground">{text('startFromEarlier')}</p>
            {earlier.map((run) => (
              <button key={String(run.id)} type="button" className="truncate rounded-md px-2 py-1 text-left text-xs hover:bg-muted max-md:min-h-11" onClick={() => setInput(written(run.input))}>
                {text('earlierRun', { when: formatDateTime(Date.parse(String(run.created_at))), status: status.label(run.status) })}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{unsaved ? text('savesThenRuns', { version: version + 1 }) : view.version === undefined ? text('runsLatest', { version }) : text('runsVersion', { version })}</p>
        <p className="text-xs text-muted-foreground">{acting.length > 0 ? text('stepsAct', { steps: acting.map((step) => text('stepActs', { name: step.name, kind: step.kind })).join(', ') }) : text('nothingActs')}</p>
        {refused && <p role="alert" className="text-xs text-danger-text">{text('notStarted')}</p>}
      </InPlaceForm>
    </FocusPanel>
  )
}
