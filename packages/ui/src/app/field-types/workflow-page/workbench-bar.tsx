import { CircleAlert, History, Play, Plus, Power, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FocusActions, FocusSlot, useFocusPage, type FocusAction } from '../../../focus-page'
import { useIsDesktop } from '../../../lib/use-media-query'
import { Badge } from '../../../primitives/badge'
import { Button } from '../../../primitives/button'
import { Select } from '../../../primitives/select'
import { useFocusRecord } from '../../focus/focus-record'
import { usePermissions } from '../../meta-gate'
import { can } from '../../permissions'
import { useAppAddress } from '../../use-app-address'
import { versionLabel } from './picker-labels'
import type { WorkflowPage } from './use-workflow-page'
import { versionAddress, type WorkflowView } from './workflow-view'
import { text } from './messages'

export type WorkbenchBarProps = {
  view: WorkflowView
  page: WorkflowPage
  /** Whether the graph takes changes. */
  editable: boolean
  /** The workflow has no step yet, so a run has nothing to do. */
  empty: boolean
  /** How many problems the save's check would refuse, those that are fields to fill in counted apart. */
  problems: number
  /** How many fields are still to fill in. */
  missing: number
  onAddStep: () => void
  onProblems: () => void
  onRuns: () => void
  onTestRun: () => void
  onPublish: () => void
  onTurnOff: () => void
  /** What the run shown offers. */
  runActions?: FocusAction[] | undefined
}

// How the work stands, in words of the workflow: which version a save made, or that there is more to save
const WorkState = ({ page, draftOnly }: { page: WorkflowPage; draftOnly: boolean }) => {
  const focus = useFocusRecord()!
  const size = useFocusPage()?.size
  // What a save made says so for a moment, then the bar has its room back
  const [saved, setSaved] = useState<number>()
  const before = useRef(page.latest)
  useEffect(() => {
    if (page.latest === before.current) return
    const first = before.current === undefined
    before.current = page.latest
    if (first) return
    setSaved(page.latest)
    const timer = setTimeout(() => setSaved(undefined), savedShownMs)
    return () => clearTimeout(timer)
  }, [page.latest])
  const words = () => {
    if (focus.saving) return text('saving')
    if (focus.refused) return text('saveRefused')
    if (focus.dirty && draftOnly) return text('draftHere')
    if (focus.dirty) return size === 'wide' ? text('unsaved') : text('unsavedShort')
    return saved === undefined ? undefined : text('savedAs', { version: saved })
  }
  const shown = words()
  return shown ? <FocusSlot zone="state"><span role="status" className="truncate">{shown}</span></FocusSlot> : null
}

const savedShownMs = 4000

/**
 * What a workflow's page puts in its bar: what is live, the version shown, the step and run tools, how the work stands,
 * Test run, and Publish as the primary, with Save beside it from the framework. A mobile screen keeps what checks a
 * failure and acts on it, and the graph's structure stays on wider ones.
 */
export const WorkbenchBar = ({ view, page, editable, empty, problems, missing, onAddStep, onProblems, onRuns, onTestRun, onPublish, onTurnOff, runActions }: WorkbenchBarProps) => {
  const focus = useFocusRecord()!
  const { go } = useAppAddress()
  const size = useFocusPage()?.size
  const desktop = useIsDesktop()
  const mayRun = can(usePermissions('workflow_runs'), 'create')
  const { latest, enabled } = page
  const shown = view.version ?? latest
  const live = enabled !== undefined && enabled === shown
  const versions = useMemo(() => (shown === undefined || page.versions.some((each) => each.version === shown) ? page.versions : [...page.versions, { version: shown, savedAt: '' }]), [page.versions, shown])
  const blocked = empty ? text('noStepsToRun') : live && !focus.dirty ? text('alreadyLive', { version: shown ?? 0 }) : undefined
  const compact = size === 'compact'
  const testRun: FocusAction | undefined = mayRun ? { name: text('testRun'), icon: Play, onRun: onTestRun, inBar: true, ...(empty && { blocked: text('noStepsToRun') }) } : undefined
  const publish: FocusAction = { name: text('publish'), icon: Upload, onRun: onPublish, ...(blocked && { blocked }) }
  const actions: FocusAction[] = [
    ...(testRun && !compact ? [testRun] : []),
    ...(compact && focus.mayUpdate ? [publish] : []),
    ...(runActions ?? []),
    ...(enabled !== undefined && focus.mayUpdate ? [{ name: text('turnOff'), icon: Power, onRun: onTurnOff }] : []),
  ]
  return (
    <>
      <FocusSlot zone="mode">
        <Badge tone={enabled === undefined ? 'neutral' : 'green'}>{enabled === undefined ? text('off') : text('live', { version: enabled })}</Badge>
        {size !== 'compact' && (
          <Select aria-label={text('version')} className="w-auto" value={shown ?? ''} onChange={(event) => go(versionAddress(view.workflow, Number(event.target.value), latest))}>
            {versions.map(({ version }) => (
              <option key={version} value={version}>{versionLabel(version, { latest, enabled })}</option>
            ))}
          </Select>
        )}
      </FocusSlot>
      <FocusSlot zone="controls">
        {editable && desktop && (
          <Button onClick={onAddStep} aria-label={text('addStep')}>
            <Plus className="size-3.5" aria-hidden />
            {size !== 'narrow' && text('addStep')}
          </Button>
        )}
        <Button onClick={onRuns} className="max-md:min-h-11">
          <History className="size-3.5" aria-hidden />
          {text('runs')}
        </Button>
        {problems > 0 && (
          <Button onClick={onProblems} className="text-danger-text">
            <CircleAlert className="size-3.5" aria-hidden />
            {text('problems', { count: problems })}
          </Button>
        )}
        {missing > 0 && problems === 0 && <Button onClick={onProblems}>{text('fieldsToFill', { count: missing })}</Button>}
      </FocusSlot>
      <WorkState page={page} draftOnly={missing > 0} />
      <FocusActions actions={actions} />
      {focus.mayUpdate && !compact && (
        <FocusSlot zone="primary">
          <Button variant={focus.dirty ? 'secondary' : 'primary'} aria-disabled={blocked !== undefined} title={blocked} onClick={() => blocked === undefined && onPublish()}>
            {text('publish')}
          </Button>
        </FocusSlot>
      )}
      {compact && testRun && !focus.dirty && !empty && (
        <FocusSlot zone="primary">
          <Button variant="primary" className="min-h-11" onClick={onTestRun}>
            {text('testRun')}
          </Button>
        </FocusSlot>
      )}
    </>
  )
}
