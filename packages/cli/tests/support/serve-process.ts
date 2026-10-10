import type { ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import postgres from 'postgres'
import { bin, run, typescriptArgs } from './auth-project'

export const withDatabase = (target: string, database: string) => {
  const next = new URL(target)
  next.pathname = `/${database}`
  return next.toString()
}

// Resolves once a serve process prints that it listens; rejects when it exits first or takes longer than `timeout`.
export const untilListening = (child: ChildProcess, timeout: number) =>
  new Promise<void>((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error(`serve process not ready in time:\n${output}`)), timeout)
    const collect = (chunk: Buffer) => {
      output += chunk
      if (!output.includes('protobase serve listening')) return
      clearTimeout(timer)
      resolve()
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`serve process exited with ${code}:\n${output}`))
    })
  })

export const stopProcess = async (child: ChildProcess | undefined) => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGKILL')
  await exited
}

/**
 * The ERP's environment against a fresh database for its admin store, migrated and with one admin user.
 * `dispose` drops the database.
 */
export const createErpAuthStore = async ({ url, erpDir, base, email, password }: { url: string; erpDir: string; base: string; email: string; password: string }) => {
  const database = `protobase_serve_test_${randomBytes(4).toString('hex')}`
  const admin = postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })
  await admin.unsafe(`create database ${database}`)
  await admin.end()

  const env = {
    DATABASE_URL: url,
    ADMIN_DATABASE_URL: withDatabase(url, database),
    BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
    BETTER_AUTH_URL: base,
  }
  const migrated = await run(typescriptArgs('db/auth-migrate.ts'), erpDir, env)
  if (migrated.status !== 0) throw new Error(`auth migration failed:\n${migrated.stderr}`)
  const created = await run([bin, 'users', 'create', email, '--role', 'admin', '--password-stdin'], erpDir, env, `${password}\n`)
  if (created.status !== 0) throw new Error(`users create failed:\n${created.stderr}`)

  const dispose = async () => {
    const cleanup = postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })
    await cleanup.unsafe(`drop database if exists ${database} with (force)`)
    await cleanup.end()
  }
  return { env, dispose }
}

// Signs in with Better Auth's email endpoint and trades the session cookie for a bearer token.
export const signIn = async (base: string, email: string, password: string) => {
  const response = await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password }),
  })
  if (response.status !== 200) throw new Error(`sign-in answered ${response.status}`)
  const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
  const token = await fetch(`${base}/api/auth/token`, { headers: { cookie } })
  if (token.status !== 200) throw new Error(`token answered ${token.status}`)
  return (await token.json()).token as string
}
