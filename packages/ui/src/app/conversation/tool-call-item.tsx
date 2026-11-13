import { ChevronRight } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import type { FieldViewModel } from '@protobase/schema'
import { cn } from '../../lib/cn'
import { Button } from '../../primitives/button'
import { CodeBlock } from '../../primitives/code-block'
import { JsonBlock } from '../field-types/json/json-block'
import { jsonOf, notJson } from '../field-types/json/json-text'
import { MessageStatus } from './message-status'
import type { ToolCall } from './tool-calls'
import { text } from './messages'

// A value as pretty JSON; a text that holds JSON shows as the value it holds, any other text as written
const Value = ({ value }: { value: unknown }) => {
  const parsed = typeof value === 'string' ? jsonOf(value) : value
  return parsed === notJson ? <CodeBlock>{String(value)}</CodeBlock> : <JsonBlock value={parsed} />
}

const Part = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid gap-1">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    {children}
  </div>
)

/**
 * A tool call between a thread's messages: its tool's name and its status with its mark, and a toggle, closed at
 * first, that opens to its input and result as pretty JSON and its error.
 */
export const ToolCallItem = ({ call, statusHints }: { call: ToolCall; statusHints: FieldViewModel | undefined }) => {
  const [open, setOpen] = useState(false)
  const id = useId()
  const status = call.status !== undefined && <MessageStatus value={call.status} hints={statusHints} mark={call.state} />
  const name = <span className="font-mono text-xs text-foreground">{call.name}</span>
  const opens = call.input !== undefined || call.result !== undefined || call.error !== undefined
  return (
    <div data-tool-call className="flex min-w-0 flex-col gap-1 pl-11 text-xs text-muted-foreground">
      {opens ? (
        <Button size="sm" variant="ghost" className="-ml-2.5 self-start" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          <ChevronRight aria-hidden className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
          {name}
          {status}
        </Button>
      ) : (
        <p className="flex items-center gap-1.5">
          {name}
          {status}
        </p>
      )}
      {open && (
        <div id={id} className="grid gap-2">
          {call.input !== undefined && <Part label={text('callInput')}><Value value={call.input} /></Part>}
          {call.result !== undefined && <Part label={text('callResult')}><Value value={call.result} /></Part>}
          {call.error !== undefined && <Part label={text('callError')}><CodeBlock>{call.error}</CodeBlock></Part>}
        </div>
      )}
    </div>
  )
}
