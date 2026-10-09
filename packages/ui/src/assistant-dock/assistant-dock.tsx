import { Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../primitives/button'
import { Composer } from './composer'
import { DockItemView, type DockItemHandlers } from './dock-item'
import { formatCredits, type DockItem } from './model'

export type AssistantDockProps = DockItemHandlers & {
  /** The chat in order: messages and the cards of its tasks and queries. */
  items: DockItem[]
  /** The organization's credits; Approve needs the plan's quote. */
  balance: number
  replying?: boolean
  onSend?: (text: string) => void
  onClose?: () => void
}

/** The assistant beside the app: chat, plans to approve, the queue, progress, results and query tables. */
export const AssistantDock = ({ items, balance, replying, onSend, onClose, onRequestChanges, ...handlers }: AssistantDockProps) => {
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [revising, setRevising] = useState(false)

  useEffect(() => {
    const element = list.current
    if (element) element.scrollTop = element.scrollHeight
  }, [items.length])

  const requestChanges = (taskId: string) => {
    setRevising(true)
    input.current?.focus()
    onRequestChanges?.(taskId)
  }
  const send = (text: string) => {
    setRevising(false)
    onSend?.(text)
  }

  return (
    <aside aria-label="Assistant" className="flex h-full w-[380px] max-w-full shrink-0 flex-col border-l border-border bg-surface">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
        <Sparkles className="size-4 text-primary" />
        <h2 className="flex-1 text-[13px] font-semibold">Assistant</h2>
        <span className="text-xs font-medium text-muted-foreground">{formatCredits(balance)}</span>
        {onClose && (
          <Button variant="ghost" size="sm" className="w-7 px-0" aria-label="Close" onClick={onClose}>
            <X className="size-4" />
          </Button>
        )}
      </header>
      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {items.length === 0 && <p className="m-auto max-w-60 text-center text-[13px] text-muted-foreground">Ask for a change to this app, or a question about its data.</p>}
        {items.map((item) => <DockItemView key={item.id} item={item} balance={balance} handlers={{ ...handlers, onRequestChanges: requestChanges }} />)}
      </div>
      <footer className="shrink-0 border-t border-border bg-background p-3">
        <Composer inputRef={input} onSend={send} replying={replying} placeholder={revising ? 'What should change in the plan?' : 'Ask for a change or about your data...'} />
      </footer>
    </aside>
  )
}
