import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'

// The project's env files hold its secrets (auth secret, database URL, API keys), which npm's install scripts, Gradle
// and Xcode never need. Bun loads them into the CLI's own environment before any of its code runs, so their keys are
// left out of every child's environment by name: Bun expands `$` in values and `parseEnv` does not, so values cannot
// be compared. Files count as Bun counts them: by what a link points at, and only when that is a file.

const isFile = (file: string) => {
  try {
    return statSync(file).isFile()
  } catch (error) {
    // A dangling link, which Bun skips too.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/** The files in `dir` Bun may have loaded env from: every `.env*`, in any letter case, that is a file once links are followed. */
export const projectEnvFiles = (dir: string) =>
  readdirSync(dir)
    .filter((name) => name.toLowerCase().startsWith('.env'))
    .map((name) => path.join(dir, name))
    .filter(isFile)

/** The keys `files` set, without a leading byte order mark, which Bun strips and `parseEnv` keeps. */
export const envFileKeys = (files: string[]) =>
  new Set(files.flatMap((file) => Object.keys(parseEnv(readFileSync(file, 'utf8').replace(/^﻿/, '')))))

/**
 * The environment for npm and Capacitor: `env` without `keys`, even where the shell set one of them, and with `CI`,
 * without which Capacitor opts the user into its telemetry from an interactive terminal and sends the app id.
 */
export const childEnv = (env: Record<string, string | undefined>, keys: Set<string>): Record<string, string> => ({
  ...(Object.fromEntries(Object.entries(env).filter(([key, value]) => value !== undefined && !keys.has(key))) as Record<string, string>),
  CI: 'true',
})
