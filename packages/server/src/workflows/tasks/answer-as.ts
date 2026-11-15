import { taskTokenHash, tokenPattern, type AnswerRefusal, type TaskAnswer, type TaskTokenStore } from '@protobase/workflows'
import type { Db } from '@protobase/query'
import type { Deps } from '../../deps'
import { fetchReadable } from '../../fetch-readable'
import { deletedRows } from '../../params'
import { requestAccess } from '../../request-access'
import type { Session } from '../../types'

export type AnswerTask = (token: string, answer: TaskAnswer) => Promise<{ run: string } | AnswerRefusal>

/** Answers a waiting Task as a signed-in caller, as the MCP tools do. */
export type AnswerTaskAs = (session: Session, token: string, answer: TaskAnswer) => Promise<{ run: string } | AnswerRefusal>

/**
 * Answers a waiting Task for a caller who may read the run it belongs to, in their tenant, as `workflow_runs`' read
 * access decides; for anyone else the token is one no Task was given, so a token tells nothing of other tenants' runs.
 */
export const answerTaskAs = (deps: () => Deps, tokens: TaskTokenStore<Db>, answer: AnswerTask): AnswerTaskAs => async (session, token, given) => {
  const unknown: AnswerRefusal = { error: 'TaskDoesNotExist', message: 'No waiting Task you may see was given this token' }
  if (!tokenPattern.test(token)) return answer(token, given)
  const found = await tokens.byHash(deps().db, await taskTokenHash(token))
  if (!found) return unknown
  const access = await requestAccess(deps(), deps().registry.find('workflow_runs')!, session)
  if (!access.resolved.operations.read) return unknown
  if (!(await fetchReadable(deps().db, access, [found.run], deletedRows(access.full, false), {}))) return unknown
  return answer(token, given)
}
