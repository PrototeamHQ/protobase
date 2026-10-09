import { Sparkles, X } from 'lucide-react'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { Switch } from '../primitives/switch'
import { ChangeCard } from './change-card'
import { ChecksList } from './checks-list'
import { changedFiles, checksFor, request, stagesWithChange, stepsFor } from './content'
import { PreviewCard } from './preview-card'
import { StepList } from './step-list'

export type AssistantStage = 'request' | 'working' | 'checks-failed' | 'checks-passed' | 'preview' | 'published'

export type AssistantPanelProps = {
  stage: AssistantStage
  buildMode: boolean
  onBuildModeChange?: (value: boolean) => void
  onClose?: () => void
  /** Hide the checks card, for compositions that show it elsewhere. */
  showChecks?: boolean
}

export const AssistantPanel = ({ stage, buildMode, onBuildModeChange, onClose, showChecks = true }: AssistantPanelProps) => {
  const hasChange = (stagesWithChange as readonly string[]).includes(stage)
  const hasChecks = showChecks && stage !== 'request' && stage !== 'working'
  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-surface">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
        <Sparkles className="size-4 text-primary" />
        <h2 className="flex-1 text-[13px] font-semibold">Assistant</h2>
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          Build mode
          <Switch checked={buildMode} onChange={onBuildModeChange} label="Build mode" />
        </label>
        <Button variant="ghost" size="sm" className="w-7 px-0" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="ml-8 self-end rounded-lg rounded-br-sm bg-primary px-3 py-2 text-[13px] text-primary-foreground shadow-sm">{request}</div>
        <StepList steps={stepsFor(stage)} />
        {hasChange && stage !== 'preview' && stage !== 'published' && <ChangeCard files={changedFiles} />}
        {hasChecks && <ChecksList checks={checksFor(stage)} />}
        {(stage === 'preview' || stage === 'published') && <PreviewCard approved={stage === 'published'} />}
        {stage === 'published' && <p className="text-xs text-success-text">Published to production. Undo is available for 24 hours.</p>}
      </div>
      <footer className="shrink-0 space-y-3 border-t border-border bg-background p-3">
        {hasChange && (
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" disabled={stage !== 'preview' && stage !== 'checks-passed'}>Publish</Button>
            <Button className="flex-1">Undo</Button>
          </div>
        )}
        <Input placeholder="Ask for a change..." />
      </footer>
    </aside>
  )
}
