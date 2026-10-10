import { useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'

export type CardTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

/** A button of a card. With `confirm`, clicking it asks that question first. `hint` is a line under the buttons. */
export type CardAction = { id: string; label: string; style?: 'primary' | 'secondary' | 'ghost' | 'danger'; disabled?: boolean; hint?: string; confirm?: string }

export type ActionCardProps = {
  title: string
  tone?: CardTone
  /** Short text at the end of the title row. */
  badge?: string
  /** A muted line under the content. */
  note?: string
  actions?: CardAction[]
  onAction?: (id: string) => void
  children?: ReactNode
}

const frames = {
  neutral: { border: 'border-border-strong', header: 'bg-surface text-foreground' },
  info: { border: 'border-primary-border', header: 'bg-primary-soft text-primary-text' },
  success: { border: 'border-success/40', header: 'bg-success-soft text-success-text' },
  warning: { border: 'border-warning/40', header: 'bg-warning-soft text-warning-text' },
  danger: { border: 'border-danger/40', header: 'bg-danger-soft text-danger-text' },
}

/** A card with a toned title row, any content, a note and buttons: the building block of rich chat messages. */
export const ActionCard = ({ title, tone = 'neutral', badge, note, actions = [], onAction, children }: ActionCardProps) => {
  const [confirming, setConfirming] = useState<CardAction>()
  const hints = actions.flatMap((action) => (action.hint ? [action.hint] : []))
  const click = (action: CardAction) => (action.confirm ? setConfirming(action) : onAction?.(action.id))
  return (
    <section aria-label={title} className={cn('shrink-0 overflow-hidden rounded-lg border bg-background whitespace-normal text-foreground shadow-sm', frames[tone].border)}>
      <header className={cn('flex items-center gap-2 px-3 py-2', frames[tone].header)}>
        <h3 className="min-w-0 flex-1 text-[13px] font-semibold">{title}</h3>
        {badge && <span className="shrink-0 text-xs font-medium">{badge}</span>}
      </header>
      {(children || note || actions.length > 0) && (
        <div className="space-y-2.5 px-3 py-2.5">
          {children}
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-0.5">
              {actions.map((action) => (
                <Button key={action.id} size="sm" variant={action.style ?? 'secondary'} className={cn(action.style === 'primary' && 'flex-1')} disabled={action.disabled} onClick={() => click(action)}>
                  {action.label}
                </Button>
              ))}
            </div>
          )}
          {hints.map((hint) => <p key={hint} className="text-xs text-muted-foreground">{hint}</p>)}
        </div>
      )}
      {confirming && (
        <Dialog
          title={`${confirming.label}?`}
          description={confirming.confirm}
          onClose={() => setConfirming(undefined)}
          actions={
            <>
              <Button onClick={() => setConfirming(undefined)}>Cancel</Button>
              <Button
                variant={confirming.style === 'danger' ? 'danger' : 'primary'}
                onClick={() => {
                  setConfirming(undefined)
                  onAction?.(confirming.id)
                }}
              >
                {confirming.label}
              </Button>
            </>
          }
        />
      )}
    </section>
  )
}
