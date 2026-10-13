// The assistant protocol between the admin app's dock and an assistant backend: a chat whose assistant messages are
// made of parts the backend defines and the app renders. The backend owns every meaning; the app only shows parts and
// sends the user's messages and button clicks back. Events travel as server-sent events, requests as JSON.

/** The colour of a card, by what it reports. */
export type AssistantTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

/** A button on a card. Clicking it posts `{ partId, actionId }`; with `confirm`, only after the user confirms that text. */
export type AssistantAction = {
  /** What the click posts as `actionId`, unique on its card. */
  id: string
  /** The button's text. */
  label: string
  /** How the button looks; `secondary` when omitted. */
  style?: 'primary' | 'secondary' | 'ghost' | 'danger'
  /** Shown but not clickable. */
  disabled?: boolean
  /** A line under the buttons, such as why one is disabled. */
  hint?: string
  /** A question the user confirms before the click is posted, such as `Run this update?`. */
  confirm?: string
}

/** Where a step of a card's work stands. */
export type AssistantStepState = 'pending' | 'running' | 'done' | 'failed'

/** One step of a card's work, listed with its state. */
export type AssistantStep = {
  /** What the step does. */
  label: string
  /** Where it stands. */
  state: AssistantStepState
}

/** Changed lines: `+` added, `-` removed, anything else context; `start` is the first line's number. */
export type AssistantDiff = {
  /** What changed, such as a file's path, shown above the lines. */
  path?: string
  /** The lines, one per line of text, each starting with `+`, `-` or anything else. */
  source: string
  /** The number of the first line; 1 when omitted. */
  start?: number
}

/** A paragraph of plain text. */
export type AssistantTextPart = {
  /** Marks a text part. */
  type: 'text'
  /** The part's id, unique in its message; a part with the same id replaces it. */
  id: string
  /** The text. */
  text: string
}

/** Rows of values; `null` stays visible, objects show as JSON. `truncated` says the rows stop at a limit. */
export type AssistantTablePart = {
  /** Marks a table part. */
  type: 'table'
  /** The part's id, unique in its message; a part with the same id replaces it. */
  id: string
  /** The column headings. */
  columns: string[]
  /** One array per row, a value per column. */
  rows: unknown[][]
  /** A line under the table, such as the query it came from. */
  caption?: string
  /** The rows stop at a limit, so there are more than shown. */
  truncated?: boolean
}

/**
 * A card with a title, and in this order whichever of `body`, `code`, `fields`, `steps` and `diffs` it has, then its
 * `note` and `actions`: what a backend proposes or reports, such as a query waiting for approval.
 */
export type AssistantCardPart = {
  /** Marks a card part. */
  type: 'card'
  /** The part's id, unique in its message; a part with the same id replaces it, and button clicks post it as `partId`. */
  id: string
  /** The card's title. */
  title: string
  /** The card's colour; `neutral` when omitted. */
  tone?: AssistantTone
  /** Short text at the end of the title row. */
  badge?: string
  /** A paragraph of text. */
  body?: string
  /** Monospace text, such as a query. */
  code?: string
  /** Labelled values, one per line. */
  fields?: Array<{
    /** The value's label. */
    label: string
    /** The value, as text. */
    value: string
  }>
  /** The steps of the card's work, each with its state. */
  steps?: AssistantStep[]
  /** Changed lines, such as of a file or a record. */
  diffs?: AssistantDiff[]
  /** A muted line under the content, such as what happened to the card. */
  note?: string
  /** Buttons at the card's bottom. */
  actions?: AssistantAction[]
}

/**
 * A part drawn by one of the app's components, which fetches what it shows itself: the chat keeps only the
 * component's name and props such as `{ taskId }`, so the part shows the record as it is now.
 */
export type AssistantWidgetPart = {
  /** Marks a widget part. */
  type: 'widget'
  /** The part's id, unique in its message; a part with the same id replaces it. */
  id: string
  /** A component in the app's `components` (its protobase.ui.tsx and the UI configs it extends), PascalCase. */
  name: string
  /** JSON the component gets as props: ids and settings, not the state it shows. At most 2 KB. */
  props: Record<string, unknown>
  /** Drawn, as a plain card, when the app has no component by that name: what the part was about when it was made. */
  fallback?: {
    /** The card's title. */
    title: string
    /** The card's text. */
    body?: string
  }
}

/** A piece of a message, drawn by its `type`; code that switches over it handles every type. */
export type AssistantPart = AssistantTextPart | AssistantTablePart | AssistantCardPart | AssistantWidgetPart

/** A message of the chat: what the user wrote, or the backend's answer in parts. */
export type AssistantMessage = {
  /** The message's id; a message with the same id replaces it. */
  id: string
  /** Who wrote it. */
  from: 'user' | 'assistant'
  /** What it shows, in order. */
  parts: AssistantPart[]
}

/** Everything the dock shows: the chat and its header, as the event stream builds it up. */
export type AssistantState = {
  /** The chat, oldest first. */
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
 * changes the top-level fields, `null` clearing one. A backend in place of the built-in one sends these; see
 * [Another backend](website/src/content/docs/reference/assistant.md#another-backend).
 */
export type AssistantEvent =
  | {
      /** Replaces the whole state. */
      type: 'state'
      /** The new state. */
      state: AssistantState
    }
  | {
      /** Adds or replaces a message. */
      type: 'message'
      /** The message. */
      message: AssistantMessage
    }
  | {
      /** Adds or replaces a part of a message. */
      type: 'part'
      /** The id of the message the part belongs to. */
      messageId: string
      /** The part. */
      part: AssistantPart
    }
  | {
      /** Changes the state's top-level fields. */
      type: 'patch'
      /** The new `replying`, when it changes. */
      replying?: boolean
      /** The new `status`, or `null` to clear it. */
      status?: string | null
      /** The new `placeholder`, or `null` to clear it. */
      placeholder?: string | null
    }

/** `POST <url>/messages`; `page` is where the user is in the app, below its base path, such as `/orders/42?status=open`. */
export type AssistantMessageRequest = {
  /** What the user wrote. */
  text: string
  /** Where the user is in the app when they send it. */
  page?: string
}

/** `POST <url>/actions`: the user clicked a button of a card. */
export type AssistantActionRequest = {
  /** The card's `id`. */
  partId: string
  /** The button's `id`. */
  actionId: string
}
