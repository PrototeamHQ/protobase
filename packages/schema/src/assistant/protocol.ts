// The assistant protocol between the admin app's dock and an assistant backend: a chat whose assistant messages are
// made of parts the backend defines and the app renders. The backend owns every meaning; the app only shows parts and
// sends the user's messages and button clicks back. Events travel as server-sent events, requests as JSON.

export type AssistantTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

/** A button on a card. Clicking it posts `{ partId, actionId }`; with `confirm`, only after the user confirms that text. */
export type AssistantAction = {
  id: string
  label: string
  style?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean
  /** A line under the buttons, such as why one is disabled. */
  hint?: string
  confirm?: string
}

export type AssistantStepState = 'pending' | 'running' | 'done' | 'failed'

export type AssistantStep = { label: string; state: AssistantStepState }

/** Changed lines: `+` added, `-` removed, anything else context; `start` is the first line's number. */
export type AssistantDiff = { path?: string; source: string; start?: number }

export type AssistantTextPart = { type: 'text'; id: string; text: string }

/** Rows of values; `null` stays visible, objects show as JSON. `truncated` says the rows stop at a limit. */
export type AssistantTablePart = { type: 'table'; id: string; columns: string[]; rows: unknown[][]; caption?: string; truncated?: boolean }

export type AssistantCardPart = {
  type: 'card'
  id: string
  title: string
  tone?: AssistantTone
  /** Short text at the end of the title row. */
  badge?: string
  body?: string
  /** Monospace text, such as a query. */
  code?: string
  fields?: Array<{ label: string; value: string }>
  steps?: AssistantStep[]
  diffs?: AssistantDiff[]
  /** A muted line under the content, such as what happened to the card. */
  note?: string
  actions?: AssistantAction[]
}

/**
 * A part drawn by one of the app's components, which fetches what it shows itself: the chat keeps only the
 * component's name and props such as `{ taskId }`, so the part shows the record as it is now.
 */
export type AssistantWidgetPart = {
  type: 'widget'
  id: string
  /** A component in the app's `components` (its protobase.ui.tsx and the UI configs it extends), PascalCase. */
  name: string
  /** JSON the component gets as props: ids and settings, not the state it shows. At most 2 KB. */
  props: Record<string, unknown>
  /** Drawn, as a plain card, when the app has no component by that name: what the part was about when it was made. */
  fallback?: { title: string; body?: string }
}

export type AssistantPart = AssistantTextPart | AssistantTablePart | AssistantCardPart | AssistantWidgetPart

export type AssistantMessage = { id: string; from: 'user' | 'assistant'; parts: AssistantPart[] }

export type AssistantState = {
  messages: AssistantMessage[]
  /** The backend is answering: the user can write but not send. */
  replying: boolean
  /** A line in the dock's header. */
  status?: string
  /** The composer's placeholder; a new one focuses the composer. */
  placeholder?: string
}

/**
 * What the event stream sends. `state` replaces everything and always comes first on a connection; `message` adds a
 * message or replaces the one with its id; `part` adds a part to a message or replaces the one with its id; `patch`
 * changes the top-level fields, `null` clearing one.
 */
export type AssistantEvent =
  | { type: 'state'; state: AssistantState }
  | { type: 'message'; message: AssistantMessage }
  | { type: 'part'; messageId: string; part: AssistantPart }
  | { type: 'patch'; replying?: boolean; status?: string | null; placeholder?: string | null }

/** `POST <url>/messages`; `page` is where the user is in the app, below its base path, such as `/orders/42?status=open`. */
export type AssistantMessageRequest = { text: string; page?: string }

/** `POST <url>/actions` */
export type AssistantActionRequest = { partId: string; actionId: string }
