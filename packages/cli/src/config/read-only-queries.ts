import { assistantSettings, type AdminOptions } from '@protobase/server'

/**
 * Whether the built-in assistant's read-only queries run, with its key set in `env` or the options: they run as a
 * role of their own, which the query module makes.
 */
export const readOnlyQueriesOn = (assistant: AdminOptions['assistant'], env: Record<string, string | undefined>) => assistantSettings(assistant, env)?.kind === 'built-in'
