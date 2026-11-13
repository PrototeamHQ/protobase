// The launcher's home folder and what it keeps there between runs: the secret, the database password and ports, and the
// admin's sign-in, written once on the first run.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type Settings = { secret: string; dbPassword: string; dbPort: number; appPort: number; admin?: { email: string; password: string } }

/** PROTOBASE_HOME, else %LOCALAPPDATA%\Protobase\automations. */
export const homeDir = (env: Record<string, string | undefined>) => {
  if (env.PROTOBASE_HOME) return path.resolve(env.PROTOBASE_HOME)
  if (!env.LOCALAPPDATA) throw new Error('LOCALAPPDATA is not set: set PROTOBASE_HOME to the folder Protobase keeps its data in')
  return path.join(env.LOCALAPPDATA, 'Protobase', 'automations')
}

const file = (home: string) => path.join(home, 'settings.json')

export const writeSettings = (home: string, settings: Settings) => writeFileSync(file(home), `${JSON.stringify(settings, null, 2)}\n`)

/** The settings of earlier runs, or new ones, written at once. */
export const readSettings = (home: string): Settings => {
  if (existsSync(file(home))) return JSON.parse(readFileSync(file(home), 'utf8'))
  mkdirSync(home, { recursive: true })
  const fresh = { secret: randomBytes(32).toString('base64'), dbPassword: randomBytes(18).toString('base64url'), dbPort: 55432, appPort: 3000 }
  writeSettings(home, fresh)
  return fresh
}

/** PROTOBASE_OPEN_BROWSER: true or false, true when unset. */
export const readOpenBrowser = (env: Record<string, string | undefined>) => {
  const value = env.PROTOBASE_OPEN_BROWSER || 'true'
  if (value !== 'true' && value !== 'false') throw new Error(`PROTOBASE_OPEN_BROWSER must be true or false, not "${value}"`)
  return value === 'true'
}
