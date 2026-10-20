import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/**
 * The connection string without its password, which goes to the tool in `PGPASSWORD` instead, so no command line or
 * error message carries it.
 */
export const toolConnection = (url: string) => {
  const parsed = new URL(url)
  const password = decodeURIComponent(parsed.password)
  parsed.password = ''
  return { dbname: parsed.toString(), env: password ? { PGPASSWORD: password } : {} }
}

type ToolError = NodeJS.ErrnoException & { stderr?: string }

/** Runs PostgreSQL's client tool `tool` (pg_dump, psql) on the database at `url`, failing with what it wrote to stderr. */
export const runPgTool = async (tool: 'pg_dump' | 'psql', url: string, args: string[]) => {
  const { dbname, env } = toolConnection(url)
  try {
    await exec(tool, [`--dbname=${dbname}`, ...args], { env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 })
  } catch (error) {
    const failure = error as ToolError
    if (failure.code === 'ENOENT') throw new Error(`${tool} is not on PATH: install the PostgreSQL client tools, of the source database's major version or newer`)
    if (typeof failure.stderr === 'string') throw new Error(`${tool} failed: ${failure.stderr.trim()}`)
    throw error
  }
}
