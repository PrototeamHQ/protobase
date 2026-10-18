import { pickView } from '@protobase/schema'
import { promptFields } from '@protobase/schema/internal'
import { ModelError } from '../assistant/chat-completions'
import type { Deps } from '../deps'
import { badRequest, forbidden, HttpProblem, notFound } from '../problem'
import { readRecord } from '../read-service'
import type { Entry } from '../registry'
import type { Session } from '../types'
import { runWrite } from '../write-pipeline'
import { generateValue } from './generate-value'

/** How long the model may take to answer one click. */
const answerTimeoutMs = 60_000

const actionName = (body: unknown) => {
  const action = typeof body === 'object' && body !== null ? (body as { action?: unknown }).action : undefined
  if (typeof action !== 'string' || action === '') throw badRequest('invalid-action', 'Send the name of the AI action, as { "action": "<name>" }')
  return action
}

// The run of the caller's view of the resource's AI action of that name: per-role views decide who has which.
const aiRun = (deps: Deps, entry: Entry, session: Session, name: string) => {
  const run = pickView(deps.views, session.user.roles, entry.name)?.actions.find((action) => action.name === name)?.run
  if (run?.kind !== 'ai' || run.prompt === undefined) throw notFound('There is no such AI action')
  return { prompt: run.prompt, writes: run.writes }
}

const unavailable = () => new HttpProblem(502, 'ai-unavailable', 'Bad Gateway', 'The model did not answer. Try again later.')

/**
 * Runs the AI action `body.action` on a record as the caller (`POST /{resource}/{key}:generate`): reads the record,
 * has the model write the action's field from its prompt, and updates it with the ETag it read, so an edit made while
 * the model answered fails the write with 412 instead of being overwritten. Only a signed-in user whose view has the
 * action, who may read the fields its prompt names and update the field it writes, runs it; nothing is asked of the
 * model before those checks pass. A model that fails is reported to the app and answers 502, without its message.
 */
export const generateField = async (deps: Deps, entry: Entry, session: Session, key: (string | number)[], body: unknown, signal: AbortSignal) => {
  if (session.anonymous) throw forbidden('ai-needs-user', 'Sign in to run an AI action')
  const run = aiRun(deps, entry, session, actionName(body))
  const model = deps.ai?.model
  if (!model) throw new HttpProblem(503, 'ai-not-configured', 'Service Unavailable', 'AI actions need a model: set PROTOBASE_ASSISTANT_API_KEY')
  const { record, etag, permissions } = await readRecord(deps, entry, session, key)
  const readable = promptFields(run.prompt).every((name) => Object.hasOwn(record, name))
  if (!readable || permissions.fields[run.writes] !== 'edit') throw forbidden('ai-forbidden', `You may not run this AI action on this ${entry.name} record`)

  const value = await generateValue(model, { prompt: run.prompt, record, field: entry.model.fields[run.writes]! }, AbortSignal.any([signal, AbortSignal.timeout(answerTimeoutMs)])).catch((error: unknown) => {
    if (!(error instanceof ModelError) && !(error instanceof Error && error.name === 'TimeoutError')) throw error
    deps.ai?.report?.(error)
    throw unavailable()
  })
  if (value === null) throw new HttpProblem(422, 'ai-no-value', 'Unprocessable Content', 'The fields the prompt reads are empty, or the model gave no answer')
  return runWrite(deps, entry, session, { operation: 'update', key, body: { [run.writes]: value }, ifMatch: etag })
}
