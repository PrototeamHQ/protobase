import type { Step } from '../assistant-panel/content'
import { StepList } from '../assistant-panel/step-list'

const titles = { planning: 'Planning', running: 'Making the change' }

/** What the planning run or the job is doing, step by step. */
export const ProgressCard = ({ phase, steps }: { phase: 'planning' | 'running'; steps: Step[] }) => (
  <section aria-label={titles[phase]} className="shrink-0 space-y-2 rounded-lg border border-border-strong bg-background px-3 py-2.5 shadow-sm">
    <h3 className="text-xs font-semibold">{titles[phase]}</h3>
    <StepList steps={steps} />
  </section>
)
