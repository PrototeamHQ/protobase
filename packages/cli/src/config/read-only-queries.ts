import { assistantSettings, type AdminOptions } from '@protobase/server'

/**
 * Whether read-only queries run: those of the built-in assistant, with its key set in `env` or the options, or of the
 * MCP endpoint's `sql`. They run as a role of their own, which the query module makes.
 */
export const readOnlyQueriesOn = ({ assistant, mcp }: Pick<AdminOptions, 'assistant' | 'mcp'>, env: Record<string, string | undefined>) =>
  assistantSettings(assistant, env)?.kind === 'built-in' || (mcp !== false && mcp?.sql === true)
