import { CheckCircle2, TriangleAlert, X, XCircle } from 'lucide-react'
import { inApp } from '../app-shell/breadcrumb'
import { cn } from '../lib/cn'
import { Spinner } from '../primitives/spinner'

/** `warning`: done, but not as asked, such as a drop moved to the first place a rule allows. */
export type ToastState = 'loading' | 'success' | 'warning' | 'error'

/**
 * A button, or a link when the action goes somewhere: an `<a href>`, which `onNavigate` follows in the app on a plain
 * left click; modified and middle clicks are left to the browser.
 */
export type ToastAction = { label: string; onClick: () => void } | { label: string; href: string; onNavigate?: (href: string) => void }

export type ToastProps = { state: ToastState; title: string; description?: string; action?: ToastAction; onDismiss?: () => void }

// The negative margin takes the padding of the hover background back, so the label lines up with the title.
const actionClass = '-my-0.5 rounded px-1.5 py-0.5 font-medium text-primary-text hover:bg-primary-soft'

const Action = ({ action }: { action: ToastAction }) => {
  if ('onClick' in action) {
    return (
      <button type="button" onClick={action.onClick} className={actionClass}>
        {action.label}
      </button>
    )
  }
  const { href, onNavigate } = action
  return (
    <a
      href={href}
      onClick={(event) => {
        if (!onNavigate || !inApp(event)) return
        event.preventDefault()
        onNavigate(href)
      }}
      className={actionClass}
    >
      {action.label}
    </a>
  )
}

const icons = {
  loading: <Spinner className="text-primary" />,
  success: <CheckCircle2 className="size-4 text-success" />,
  warning: <TriangleAlert className="size-4 text-warning" />,
  error: <XCircle className="size-4 text-danger" />,
}

export const Toast = ({ state, title, description, action, onDismiss }: ToastProps) => (
  <div
    role={state === 'error' ? 'alert' : 'status'}
    className={cn(
      'flex w-full max-w-80 items-start gap-3 rounded-lg border bg-background p-3 shadow-pop [animation:pb-slide-in_160ms_ease-out]',
      state === 'warning' && 'border-warning/40',
      state === 'error' && 'border-danger/40',
    )}
  >
    <span className="mt-0.5">{icons[state]}</span>
    <div className="min-w-0 flex-1">
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
    </div>
    {action && <Action action={action} />}
    {onDismiss && (
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="inline-flex items-center justify-center rounded p-0.5 text-faint-foreground hover:bg-muted hover:text-foreground pointer-coarse:size-9">
        <X className="size-3.5" />
      </button>
    )}
  </div>
)
