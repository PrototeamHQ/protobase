import { CheckCircle2, PhoneIncoming, RotateCw, TriangleAlert, X, XCircle } from 'lucide-react'
import { inApp } from '../app-shell/breadcrumb'
import { cn } from '../lib/cn'
import { Spinner } from '../primitives/spinner'
import { text } from './messages'

/**
 * `warning`: done, but not as asked, such as a drop moved to the first place a rule allows. `info`: news that asks for
 * no answer now, such as a new version of the app. `call`: a call ringing the person, which asks for an answer.
 */
export type ToastState = 'loading' | 'success' | 'warning' | 'error' | 'info' | 'call'

/**
 * A button, or a link when the action goes somewhere: an `<a href>`, which `onNavigate` follows in the app on a plain
 * left click; modified and middle clicks are left to the browser.
 */
export type ToastAction = { label: string; onClick: () => void } | { label: string; href: string; onNavigate?: (href: string) => void }

/** `actions`: more than one answer, such as a ring's Decline and Accept, in that order, after `action`. */
export type ToastProps = { state: ToastState; title: string; description?: string; action?: ToastAction; actions?: ToastAction[]; onDismiss?: () => void }

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
  info: <RotateCw className="size-4 text-primary" />,
  call: <PhoneIncoming className="size-4 animate-pulse text-success" />,
}

export const Toast = ({ state, title, description, action, actions = [], onDismiss }: ToastProps) => (
  <div
    role={state === 'error' || state === 'call' ? 'alert' : 'status'}
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
    {actions.map((each) => (
      <Action key={each.label} action={each} />
    ))}
    {onDismiss && (
      <button type="button" aria-label={text('dismiss')} onClick={onDismiss} className="inline-flex items-center justify-center rounded p-0.5 text-faint-foreground hover:bg-muted hover:text-foreground pointer-coarse:size-9">
        <X className="size-3.5" />
      </button>
    )}
  </div>
)
