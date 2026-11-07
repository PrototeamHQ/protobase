import { FileText } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkflowTypeList } from '@protobase/client'
import type { Definition } from '@protobase/workflows'
import { FocusPanel } from '../../../focus-page'
import { useIsDesktop } from '../../../lib/use-media-query'
import { Button } from '../../../primitives/button'
import { Skeleton } from '../../../primitives/skeleton'
import { ErrorBanner } from '../../error-banner'
import { useFocusRecord } from '../../focus/focus-record'
import { useAppAddress } from '../../use-app-address'
import { nodeTraces } from '../workflow-run/run-trace'
import { definitionOf, pathOf, splitPath, stateAt, triggerId, allNames } from '../workflow/definition'
import { addStateAfter, addStateFirst, freeName, placeAfter, type NewState } from '../workflow/definition-edits'
import { NodePanel } from '../workflow/node-panel'
import { ProblemList } from '../workflow/problem-list'
import { definitionProblems, isMissing, problemsByNode, withoutMissing } from '../workflow/problems'
import { WorkflowCanvas } from '../workflow/workflow-canvas'
import { text as graphText } from '../workflow/messages'
import { usePermissions } from '../../meta-gate'
import { can } from '../../permissions'
import { formatDateTime } from '../../../format/date'
import type { ValueActions } from '../workflow-run/step-card'
import { ValueInsertContext } from '../workflow/value-insert-context'
import { AddStepPanel } from './add-step-panel'
import { InsertValueView, type InsertTarget } from './insert-value-view'
import { ReplayPanel, RerunPanel } from './rerun-panel'
import { RunSidePanel } from './run-side-panel'
import { ValueButtons } from './value-actions'
import { PublishPanel, TurnOffPanel } from './publish-panel'
import { RunNotice } from './run-notice'
import { RunsPanel } from './runs-panel'
import { StepSidePanel, type StepTab } from './step-side-panel'
import { TestRunPanel, type TestSeed } from './test-run-panel'
import { useWorkflowPage } from './use-workflow-page'
import { variableFor } from './value-insert'
import { WorkbenchBar } from './workbench-bar'
import type { WorkflowView } from './workflow-view'
import { text } from './messages'

export type WorkflowWorkbenchProps = {
  view: WorkflowView
  /** The definition as the record holds it, with its unsaved changes: the latest version. */
  value: unknown
  types: WorkflowTypeList
  /** Without it, the latest version is only shown, as to someone who may not change it. */
  onChange?: (definition: Definition) => void
}

/** What the end panel shows by a button of the bar; with none, it shows the step chosen. */
type Panel = { kind: 'add' } | { kind: 'test'; seed?: TestSeed } | { kind: 'runs' } | { kind: 'publish' } | { kind: 'off' } | { kind: 'problems' } | { kind: 'rerun'; step: string } | { kind: 'replay' }

const noProblems = new Map()

// A new state goes into the Map chosen, or the Map the chosen state is in, else into the workflow itself.
const scopeFor = (definition: Definition, selected: string | undefined): string[] => {
  if (selected === undefined || selected === triggerId) return []
  const names = selected.split('/')
  return stateAt(definition, selected)?.Type === 'Map' ? names : names.slice(0, -1)
}

/**
 * A workflow on its focus page: the graph fills the surface, the latest version to edit or an older one to read, with a
 * run's marks on either, followed live; the bar holds what is live, the versions and the tools; and the end panel takes
 * the step chosen, the step picker, Test run, the runs and Publish, so nothing leaves the graph.
 */
export const WorkflowWorkbench = ({ view, value, types, onChange }: WorkflowWorkbenchProps) => {
  const focus = useFocusRecord()!
  const page = useWorkflowPage(view)
  const desktop = useIsDesktop()
  // The variable a field's next change adds to an earlier step, in that one change
  const pendingAssign = useRef<(next: Definition) => Definition>(undefined)
  // The form hands the value over anew on each render: the definition changes only when its JSON does
  const json = JSON.stringify(value ?? null)
  const draft = useMemo(() => definitionOf(JSON.parse(json)), [json])
  const past = useMemo(() => (page.pastDefinition === undefined ? undefined : definitionOf(page.pastDefinition)), [page.pastDefinition])
  const older = view.version !== undefined && view.version !== page.latest
  const definition = older ? past : draft
  const change =
    older || !onChange
      ? undefined
      : (next: Definition) => {
          const assign = pendingAssign.current
          pendingAssign.current = undefined
          onChange(assign ? assign(next) : next)
        }
  const checked = useMemo(() => problemsByNode(definition ? definitionProblems(definition, types) : []), [definition, types])
  const { address } = useAppAddress()
  const opened = address?.kind === 'record' ? address.panel : undefined
  const noSteps = allNames(draft.stateMachine).length === 0
  // A workflow with no steps opens on what comes next, where there is room to add one
  const [panel, setPanel] = useState<Panel | undefined>(opened === 'test_run' ? { kind: 'test' } : opened === 'replay' ? { kind: 'replay' } : noSteps && desktop && onChange ? { kind: 'add' } : undefined)
  // Someone tried to go on with fields left to fill in: those now show as problems
  const [attempted, setAttempted] = useState(false)
  // undefined until a node is chosen or the choice is cleared, which is null
  const [chosen, setChosen] = useState<string | null>()
  const [tab, setTab] = useState<StepTab>('data')
  // The run's own panel was closed: its marks stay on the graph until the run is hidden
  const [runPanelClosed, setRunPanelClosed] = useState(false)
  // The field asking for a value, whose step's form gives way to the picker
  const [inserting, setInserting] = useState<InsertTarget>()
  // A variable a choice of value added to an earlier step, with how to take it back
  const [added, setAdded] = useState<{ message: string; undo: Definition }>()
  const mayRun = can(usePermissions('workflow_runs'), 'create')
  useEffect(() => {
    setChosen(undefined)
    setTab('data')
    setRunPanelClosed(false)
  }, [view.run])
  useEffect(() => {
    if (focus.refused) setAttempted(true)
  }, [focus.refused])
  const { trace } = page
  const run = view.run === undefined || !trace.run || !trace.id ? undefined : { ...trace.run, id: trace.id, created_at: String(trace.run.created_at) }
  const traces = useMemo(() => {
    if (!trace.definition) return undefined
    const marks = nodeTraces(trace.steps, { inProgress: trace.going, startAt: trace.definition.stateMachine.StartAt })
    if (!definition) return marks
    return new Map([...marks].map(([path, mark]) => [path, { ...mark, changed: JSON.stringify(stateAt(trace.definition!, path)) !== JSON.stringify(stateAt(definition, path)) }]))
  }, [trace.definition, trace.steps, trace.going, definition])
  const failed = traces && [...traces].filter(([, mark]) => mark.status === 'failed').map(([path]) => path).sort((a, b) => b.split('/').length - a.split('/').length)[0]
  const selected = definition && (chosen === triggerId || (typeof chosen === 'string' && stateAt(definition, chosen))) ? (chosen as string) : chosen === undefined && failed !== undefined && definition && stateAt(definition, failed) ? failed : undefined
  if (page.pastError) return <ErrorBanner title={text('versionFailed')} error={page.pastError} />
  if (page.versionsError) return <ErrorBanner title={text('versionsFailed')} error={page.versionsError} />
  if (page.runsError) return <ErrorBanner title={text('runsFailed')} error={page.runsError} />
  if (!definition) return <Skeleton className="h-full w-full" />
  const close = () => setPanel(undefined)
  const scope = scopeFor(definition, selected)
  const placement = () => {
    if (selected === triggerId || allNames(definition.stateMachine).length === 0) return text('addsFirst')
    if (scope.length > 0 && selected === scope.join('/')) return text('addsInside', { map: splitPath(selected).name })
    const after = placeAfter(definition, scope, selected)
    return after === undefined ? text('addsUnconnected') : text('addsAfter', { step: after })
  }
  const add = (kind: NewState) => {
    if (!change) return
    const name = freeName(definition, graphText('newStep'))
    const next = selected === triggerId ? addStateFirst(definition, kind, name, graphText('newStep')) : addStateAfter(definition, scope, kind, name, graphText('newStep'), placeAfter(definition, scope, selected))
    change(next)
    setChosen(pathOf(scope, name))
    setTab('settings')
    close()
  }
  const empty = allNames(definition.stateMachine).length === 0
  const everyProblem = [...checked.whole, ...[...checked.byNode.values()].flat()]
  const missing = empty ? 0 : everyProblem.filter(isMissing).length
  const wrong = empty ? 0 : everyProblem.length - missing
  const shownProblems = attempted ? checked.byNode : withoutMissing(checked.byNode)
  // Going on with fields to fill in goes to the first of them, which now says so
  const stopAtMissing = () => {
    if (missing === 0) return false
    setAttempted(true)
    const first = [...checked.byNode].find(([, problems]) => problems.some(isMissing))?.[0]
    if (first !== undefined) setChosen(first)
    setTab('settings')
    setPanel(undefined)
    return true
  }
  const gone = trace.definition ? allNames(trace.definition.stateMachine).filter((name) => !allNames(definition.stateMachine).includes(name)).length : 0
  const whenRun = run && formatDateTime(Date.parse(run.created_at))
  // A step's input is not the workflow's, but on the step that gets it first
  const offersUse = (name: string | undefined, part: 'input' | 'output') => part === 'output' || name === undefined || name === trace.definition?.stateMachine.StartAt
  const valueActions = (name: string | undefined): ValueActions => (value, part) => (
    <ValueButtons
      value={value}
      {...(mayRun && offersUse(name, part) && {
        onUse: () => setPanel({ kind: 'test', seed: { value, from: part === 'output' ? text('seedOutput', { step: name ?? graphText('trigger'), when: whenRun ?? '' }) : text('seedInput', { step: name ?? graphText('trigger'), when: whenRun ?? '' }) } }),
      })}
    />
  )
  const ended = run !== undefined && !trace.going
  const reason = (name: string | undefined, path: string) => {
    if (!ended) return text('runNotEnded')
    if (name === undefined) return
    if (splitPath(path).scope.length > 0) return text('rerunInMap', { map: splitPath(path).scope[0]! })
    return stateAt(draft, path) ? undefined : text('stepNotInVersion', { version: page.latest ?? 0 })
  }
  const rerunFooter = (name: string | undefined, path: string) => {
    if (!run || !mayRun || name === undefined) return undefined
    const blocked = reason(name, path)
    return (
      <Button variant="primary" className="w-full max-md:min-h-11" aria-disabled={blocked !== undefined} title={blocked} onClick={() => blocked === undefined && setPanel({ kind: 'rerun', step: name })}>
        {focus.dirty ? text('saveAndRerun') : text('rerunFromStep')}
      </Button>
    )
  }
  const stepPanel = () => {
    if (selected === undefined) return null
    const name = selected === triggerId ? undefined : splitPath(selected).name
    const form = <NodePanel definition={definition} types={types} selected={selected} problems={shownProblems.get(selected) ?? []} {...(change && !focus.readOnly && { onChange: change })} onSelect={(id) => setChosen(id ?? null)} />
    const latestRun = run ?? page.runs.find((each) => each.status === 'succeeded' || each.status === 'failed')
    const settings = inserting ? (
      <InsertValueView
        definition={definition}
        path={selected}
        target={inserting}
        run={latestRun}
        onAssign={(step, variable, sample) => {
          setAdded({ message: `${text('addedVariable', { variable, step: splitPath(step).name })} ${text('inThisRun', { value: sample })}`, undo: definition })
          pendingAssign.current = (next) => variableFor(next, step).definition
        }}
        onBack={() => setInserting(undefined)}
        onTestRun={() => {
          setInserting(undefined)
          setPanel({ kind: 'test' })
        }}
      />
    ) : (
      <>
        {added && (
          <div role="status" className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs">
            <span className="min-w-0 flex-1">{added.message}</span>
            <Button size="sm" onClick={() => { change?.(added.undo); setAdded(undefined) }}>{text('undo')}</Button>
          </div>
        )}
        {form}
      </>
    )
    return (
      <StepSidePanel
        title={name ?? graphText('trigger')}
        tab={run ? tab : 'settings'}
        onTab={setTab}
        run={run}
        state={name}
        valueActions={valueActions(name)}
        footer={rerunFooter(name, selected)}
        onClose={() => setChosen(null)}
        settings={settings}
      />
    )
  }
  return (
    <>
      <WorkbenchBar
        view={view}
        page={page}
        editable={Boolean(change) && !focus.readOnly}
        empty={empty}
        problems={wrong}
        missing={missing}
        onAddStep={() => setPanel({ kind: 'add' })}
        onProblems={() => { if (!stopAtMissing()) setPanel({ kind: 'problems' }) }}
        onRuns={() => setPanel({ kind: 'runs' })}
        onTestRun={() => { if (!stopAtMissing()) setPanel({ kind: 'test' }) }}
        onPublish={() => { if (!stopAtMissing()) setPanel({ kind: 'publish' }) }}
        onTurnOff={() => setPanel({ kind: 'off' })}
        runActions={
          run && [
            ...(selected !== undefined || runPanelClosed
              ? [
                  {
                    name: text('runDetails'),
                    icon: FileText,
                    onRun: () => {
                      setChosen(null)
                      setRunPanelClosed(false)
                    },
                  },
                ]
              : []),
          ]
        }
      />
      <RunNotice view={view} page={page} failed={failed && splitPath(failed).name} changed={focus.dirty} gone={gone} {...(failed !== undefined && failed !== selected && { onOpenFailed: () => setChosen(failed) })} />
      <div className="h-full">
        <WorkflowCanvas fills definition={definition} problems={run || empty ? noProblems : shownProblems} selected={selected} onSelect={(id) => setChosen(id ?? null)} {...(change && !focus.readOnly && { onChange: change })} {...(traces && run && { traces })} types={types} />
      </div>
      {empty && panel === undefined && (
        <div className="pointer-events-none absolute inset-x-0 top-[60%] flex justify-center">
          <div className="pointer-events-auto grid justify-items-center gap-2 rounded-lg border bg-background p-6 text-center shadow-sm">
            {desktop ? (
              <>
                <h2 className="font-semibold">{text('noSteps')}</h2>
                <p className="text-body text-muted-foreground">{text('noStepsLine')}</p>
                {change && !focus.readOnly && <Button variant="primary" onClick={() => setPanel({ kind: 'add' })}>{text('addStep')}</Button>}
              </>
            ) : (
              <p className="text-body text-muted-foreground">{text('noStepsMobile')}</p>
            )}
          </div>
        </div>
      )}
      {panel?.kind === 'add' && <AddStepPanel types={types} placement={placement()} onAdd={add} onClose={close} />}
      {panel?.kind === 'test' && <TestRunPanel view={view} page={page} definition={definition} types={types} seed={panel.seed} onClose={close} />}
      {panel?.kind === 'runs' && <RunsPanel view={view} page={page} onTestRun={() => setPanel({ kind: 'test' })} onClose={close} />}
      {panel?.kind === 'publish' && <PublishPanel view={view} page={page} definition={definition} types={types} onClose={close} />}
      {panel?.kind === 'off' && <TurnOffPanel view={view} onClose={close} />}
      {panel?.kind === 'problems' && (
        <FocusPanel title={text('problemsTitle')} onClose={close} takesFocus>
          <ProblemList problems={[...checked.whole, ...[...checked.byNode.values()].flat()]} />
        </FocusPanel>
      )}
      {panel?.kind === 'rerun' && <RerunPanel view={view} page={page} definition={draft} types={types} step={panel.step} onStep={(step) => setPanel({ kind: 'rerun', step })} onClose={close} />}
      {panel?.kind === 'replay' && <ReplayPanel view={view} page={page} onClose={close} />}
      {panel === undefined && (
        <ValueInsertContext.Provider value={change && !focus.readOnly ? setInserting : undefined}>
          {selected === undefined && run && !runPanelClosed ? <RunSidePanel trace={trace} valueActions={valueActions(undefined)} onReplay={ended && mayRun ? () => setPanel({ kind: 'replay' }) : undefined} onClose={() => setRunPanelClosed(true)} /> : stepPanel()}
        </ValueInsertContext.Provider>
      )}
    </>
  )
}
