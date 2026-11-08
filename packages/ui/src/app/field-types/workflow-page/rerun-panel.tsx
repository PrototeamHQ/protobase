import type { WorkflowTypeList } from '@protobase/client'
import type { Definition } from '@protobase/workflows'
import { FocusPanel } from '../../../focus-page'
import { Button } from '../../../primitives/button'
import { ErrorBanner } from '../../error-banner'
import { useFocusRecord } from '../../focus/focus-record'
import { changedSinceRun, stepsThatAct } from './run-effects'
import { useRerun } from './use-rerun'
import type { WorkflowPage } from './use-workflow-page'
import type { WorkflowView } from './workflow-view'
import { text } from './messages'

type Common = { view: WorkflowView; page: WorkflowPage; definition: Definition; types: WorkflowTypeList; onClose: () => void }

const names = (steps: readonly { name: string; kind: string }[]) => steps.map((each) => text('stepActs', each)).join(', ')

const Started = ({ failure, refused }: { failure: unknown; refused: boolean }) => (
  <>
    {failure !== undefined && <ErrorBanner title={text('notRerun')} error={failure} />}
    {refused && <p role="alert" className="text-danger-text">{text('rerunRefused')}</p>}
  </>
)

/** Re-run from a step, asked in the end panel: what stays as it ran, what runs, and what acts. */
export const RerunPanel = ({ view, page, definition, types, step, onStep, onClose }: Common & { step: string; onStep: (step: string) => void }) => {
  const focus = useFocusRecord()!
  const rerun = useRerun(view, onClose)
  const steps = page.trace.steps.filter((each) => each.scope === '')
  const kept = Math.max(steps.findIndex((each) => each.state === step), 0)
  const acting = stepsThatAct(definition, types, step)
  const ran = new Set(steps.map((each) => each.state))
  const acted = acting.filter((each) => ran.has(each.name))
  const fresh = acting.filter((each) => !ran.has(each.name))
  const version = (page.latest ?? 0) + (focus.dirty ? 1 : 0)
  // A kept step stays as it ran, so a change to it is not in the re-run, but for a variable that keeps its result: the first such step is where a re-run sees it
  const changedBefore = steps.slice(0, kept).find((each) => changedSinceRun(page.trace.definition, definition, each.state))?.state
  const go = () => void rerun.start({ rerun_from: step })
  return (
    <FocusPanel title={text('rerunTitle', { step })} onClose={onClose} takesFocus>
      <div className="flex flex-col gap-3 text-body">
        <Started failure={rerun.failure} refused={rerun.refused} />
        <p>{kept === 0 ? text('rerunFromStart', { version }) : text('rerunKeeps', { count: kept, version })}</p>
        {acted.length > 0 && <p>{text('rerunActsAgain', { steps: names(acted) })}</p>}
        {fresh.length > 0 && <p>{text('stepsAct', { steps: names(fresh) })}</p>}
        {changedBefore && <p>{text('rerunChanged', { changed: changedBefore, step })}</p>}
        {changedBefore && (
          <Button variant="primary" className="max-md:min-h-11" onClick={() => onStep(changedBefore)}>
            {text('rerunFromInstead', { step: changedBefore })}
          </Button>
        )}
        <Button variant={changedBefore ? 'secondary' : 'primary'} className="max-md:min-h-11" loading={rerun.busy} onClick={go}>
          {changedBefore ? text('rerunWithOldResult', { step }) : focus.dirty ? text('saveAndRerunShort') : text('rerunStart')}
        </Button>
      </div>
    </FocusPanel>
  )
}

/** Replay without writing, asked in the end panel: every step runs, and those that write give what they gave. */
export const ReplayPanel = ({ view, page, onClose }: Pick<Common, 'view' | 'page' | 'onClose'>) => {
  const rerun = useRerun(view, onClose)
  return (
    <FocusPanel title={text('replayTitle')} onClose={onClose} takesFocus>
      <div className="flex flex-col gap-3 text-body">
        <Started failure={rerun.failure} refused={rerun.refused} />
        <p>{text('replayLine', { version: page.latest ?? 0 })}</p>
        <Button variant="primary" className="max-md:min-h-11" loading={rerun.busy} onClick={() => void rerun.start({ replay: true })}>
          {text('replayStart')}
        </Button>
      </div>
    </FocusPanel>
  )
}
