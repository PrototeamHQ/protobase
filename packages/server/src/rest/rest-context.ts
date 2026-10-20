import type { Context } from 'hono'
import type { Db } from '@protobase/query'
import type { Caller } from '../api-keys/resolve-caller'
import { wakeDispatch } from '../changes/actor'
import type { Deps } from '../deps'
import { readTransaction, writeTransaction } from '../transactions'
import { callerSettings } from './caller-settings'
import { restError } from './rest-error'

export type RestEnv = { Variables: { caller: Caller } }

export type RestDeps = Pick<Deps, 'db' | 'registry' | 'statementTimeoutMs' | 'guard' | 'actorSetting'>

/**
 * Runs `work` in one transaction as the request's caller (see `callerSettings`), under the statement timeout;
 * read-only for a read, so a function that writes fails as on PostgREST.
 */
export const asCaller = async <T>(deps: RestDeps, c: Context<RestEnv>, readOnly: boolean, work: (trx: Db) => Promise<T>) => {
  const settings = callerSettings(c.get('caller'), deps.actorSetting)
  if (readOnly) return readTransaction(deps.db, deps.statementTimeoutMs, work, settings)
  const result = await writeTransaction(deps.db, deps.statementTimeoutMs, work, settings)
  wakeDispatch(deps)
  return result
}

/** The request's query parameters in order, decoded as `URLSearchParams` decodes them. */
export const queryParams = (c: Context) => [...new URL(c.req.url).searchParams]

/** The JSON body; `empty` when there is none, as a function called without arguments may send. Invalid JSON is PGRST102. */
export const readBody = async (c: Context, empty?: unknown): Promise<unknown> => {
  const text = await c.req.text()
  if (text.trim() === '' && empty !== undefined) return empty
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) throw restError(400, 'PGRST102', 'Empty or invalid json')
    throw error
  }
}
