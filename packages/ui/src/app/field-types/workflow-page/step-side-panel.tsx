import { useState, type ReactNode } from 'react'
import { FocusPanel } from '../../../focus-page'
import { Segmented } from '../../../primitives/segmented'
import { StateSteps, type StepsRun } from '../workflow-run/step-panel'
import { JsonBlock } from '../json/json-block'
import { Part, type ValueActions } from '../workflow-run/step-card'
import { text } from './messages'

export type StepTab = 'data' | 'settings'

export type StepSidePanelProps = {
  title: string
  /** The form of the step, or the trigger's. */
  settings: ReactNode
  /** The run shown, when one is: the step's data is then one tab, and comes first. */
  run: StepsRun | undefined
  /** The chosen state's name; none for the trigger, whose data is the run's input. */
  state: string | undefined
  /** The Block the chosen state is inside, whose own run it ran in, when the run shown is not that one. */
  block?: string | undefined
  tab: StepTab
  onTab: (tab: StepTab) => void
  /** What can be done with the input and output shown. */
  valueActions?: ValueActions
  /** Pinned under both tabs, so a fix and its re-run need no tab switch. */
  footer?: ReactNode
  onClose: () => void
}

/** The chosen step in the end panel: its form, with its data in the run shown under a tab of its own. */
export const StepSidePanel = ({ title, settings, run, state, block, tab, onTab, valueActions, footer, onClose }: StepSidePanelProps) => (
  <FocusPanel title={title} onClose={onClose} footer={footer}>
    <div className="flex flex-col gap-4">
      {run && <Segmented<StepTab> value={tab} label={title} options={[{ value: 'data', label: text('tabData') }, { value: 'settings', label: text('tabSettings') }]} onChange={onTab} />}
      {run && tab === 'data' ? state === undefined ? <Part title={text('input')}><JsonBlock value={run.input ?? null} />{valueActions?.(run.input, 'input')}</Part> : <StateSteps run={run} name={state} {...(block !== undefined && { block })} {...(valueActions && { valueActions })} /> : settings}
    </div>
  </FocusPanel>
)
