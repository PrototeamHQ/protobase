import { CheckCircle2, X, XCircle } from 'lucide-react'
import { cn } from '../lib/cn'
import { Spinner } from '../primitives/spinner'

export type ToastState = 'loading' | 'success' | 'error'

export type ToastAction = { label: string; onClick: () => void }

export type ToastProps = { state: ToastState; title: string; description?: string; action?: ToastAction; onDismiss?: () => void }

const icons = {
  loading: <Spinner className="text-primary" />,
  success: <CheckCircle2 className="size-4 text-success" />,
  error: <XCircle className="size-4 text-danger" />,
}

export const Toast = ({ state, title, description, action, onDismiss }: ToastProps) => (
  <div
    role={state === 'error' ? 'alert' : 'status'}
    className={cn(
      'flex w-full max-w-80 items-start gap-3 rounded-lg border bg-background p-3 shadow-pop [animation:pb-slide-in_160ms_ease-out]',
      state === 'error' && 'border-danger/40',
    )}
  >
    <span className="mt-0.5">{icons[state]}</span>
    <div className="min-w-0 flex-1">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
    </div>
    {action && (
      <button type="button" onClick={action.onClick} className="rounded px-1.5 py-0.5 text-[13px] font-medium text-primary-text hover:bg-primary-soft">
        {action.label}
      </button>
    )}
    {onDismiss && (
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="inline-flex items-center justify-center rounded p-0.5 text-faint-foreground hover:bg-muted hover:text-foreground pointer-coarse:size-9">
        <X className="size-3.5" />
      </button>
    )}
  </div>
)
