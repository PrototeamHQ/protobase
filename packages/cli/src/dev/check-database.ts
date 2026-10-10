import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { connect } from '../db/connect'

const describeTarget = (url: string) => {
  const { hostname, port, pathname } = new URL(url)
  return `${hostname}:${port || 5432}${pathname}`
}

// A hint to run the project's db:up script when it has one, whichever package manager runs it.
const startHint = async (projectDir: string) => {
  const manifest = await readFile(path.join(projectDir, 'package.json'), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (!manifest) return ''
  const { scripts } = JSON.parse(manifest) as { scripts?: Record<string, string> }
  if (!scripts?.['db:up']) return ''
  return "\nStart it with the project's db:up script."
}

const reasons: Record<string, string> = {
  ECONNREFUSED: 'the connection was refused, so no Postgres is listening there',
  ENOTFOUND: 'the host name does not resolve',
  CONNECT_TIMEOUT: 'the connection timed out',
  ETIMEDOUT: 'the connection timed out',
  '28P01': 'the password was rejected',
  '28000': 'the user was rejected',
  '3D000': 'the database does not exist',
}

export const checkDatabase = async (url: string, projectDir: string) => {
  const sql = connect(url, { connectTimeout: 3 })
  const failure = await sql`select 1`.then(
    () => undefined,
    (error: NodeJS.ErrnoException) => {
      if (!error.code || !(error.code in reasons)) throw error
      return reasons[error.code]
    },
  )
  await sql.end()
  if (failure) {
    throw new Error(`Cannot reach the database at ${describeTarget(url)}: ${failure}.${await startHint(projectDir)}`)
  }
}
