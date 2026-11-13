import { toolCallStates, type ToolCallState } from '@protobase/layout'
import type { ToolCallFields } from '@protobase/schema'

type Row = Record<string, unknown>

/** A tool call of a thread: its tool's name, when it was called, its status and the mark that status gives, and what opens under it. */
export type ToolCall = { kind: 'call'; key: string; name: string; time: string | undefined; status?: string; state?: ToolCallState; input?: unknown; result?: unknown; error?: string }

const stateOf = (value: string | undefined) => (toolCallStates as readonly string[]).includes(value ?? '') ? (value as ToolCallState) : undefined

const textOf = (value: unknown) => (value == null || value === '' ? undefined : String(value))

/** A call's React key from its record key; JSON keeps composite keys such as `['a,b']` and `['a', 'b']` apart. */
export const callKey = (key: unknown) => `call:${JSON.stringify(key)}`

/** A record of a thread's tool call resource as the call it draws, by the fields the thread reads of it. */
export const toolCallOf = (row: Row, key: string, fields: ToolCallFields): ToolCall => {
  const status = textOf(row[fields.status])
  const state = stateOf(status)
  const input = fields.input === undefined ? undefined : row[fields.input]
  const result = fields.result === undefined ? undefined : row[fields.result]
  const error = fields.error === undefined ? undefined : textOf(row[fields.error])
  return {
    kind: 'call',
    key,
    name: String(row[fields.name] ?? ''),
    time: typeof row[fields.time] === 'string' ? (row[fields.time] as string) : undefined,
    ...(status !== undefined && { status }),
    ...(state !== undefined && { state }),
    ...(input != null && { input }),
    ...(result != null && { result }),
    ...(error !== undefined && { error }),
  }
}
