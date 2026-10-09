import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Toast, type ToastProps } from './toast'

type ToastItem = Omit<ToastProps, 'onDismiss'> & { id: number }
type ToastPatch = Partial<Omit<ToastItem, 'id'>>

export type ToastApi = {
  show: (toast: Omit<ToastItem, 'id'>) => number
  update: (id: number, patch: ToastPatch) => void
  dismiss: (id: number) => void
}

const dismissAfterMs = { loading: Infinity, success: 3500, error: 8000 }
const undoWindowMs = 8000

const ToastContext = createContext<ToastApi | null>(null)

export const useToast = () => {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside ToastProvider')
  return api
}

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const schedule = useCallback(
    (id: number, state: ToastItem['state'], actionable = false) => {
      clearTimeout(timers.current.get(id))
      const delay = actionable ? undoWindowMs : dismissAfterMs[state]
      if (delay === Infinity) return
      timers.current.set(id, setTimeout(() => dismiss(id), delay))
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      show: (toast) => {
        const id = nextId.current++
        setItems((current) => [...current, { ...toast, id }])
        schedule(id, toast.state, Boolean(toast.action))
        return id
      },
      update: (id, patch) => {
        setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
        if (patch.state) schedule(id, patch.state, Boolean(patch.action))
      },
      dismiss,
    }),
    [dismiss, schedule],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-24 z-[100] flex flex-col items-end gap-2 md:inset-x-auto md:bottom-4 md:right-4">
        {items.map((item) => (
          <div key={item.id} className="pointer-events-auto">
            <Toast state={item.state} title={item.title} description={item.description} action={item.action} onDismiss={() => dismiss(item.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
