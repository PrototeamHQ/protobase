import type { ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import postgres from 'postgres'
import { bin, run, typescriptArgs } from './auth-project'
import { freePort } from './database'

export const withDatabase = (target: string, database: string) => {
  const next = new URL(target)
  next.pathname = `/${database}`
  return next.toString()
}

// Resolves once a process prints `text`; rejects when it exits first or takes longer than `timeout`.
export const untilPrinted = (child: ChildProcess, text: string, timeout: number) =>
  new Promise<void>((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error(`process did not print "${text}" in time:\n${output}`)), timeout)
    const collect = (chunk: Buffer) => {
      output += chunk
      if (!output.includes(text)) return
      clearTimeout(timer)
      resolve()
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`process exited with ${code}:\n${output}`))
    })
  })

// Resolves once a serve process prints that it listens.
export const untilListening = (child: ChildProcess, timeout: number) => untilPrinted(child, 'protobase serve listening', timeout)

// Resolves with whether a serve process listens, or exited because another socket held its port.
const listensOrPortTaken = (child: ChildProcess, timeout: number) =>
  new Promise<'listening' | 'port taken'>((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error(`process did not listen in time:\n${output}`)), timeout)
    const collect = (chunk: Buffer) => {
      output += chunk
      if (!output.includes('protobase serve listening')) return
      clearTimeout(timer)
      resolve('listening')
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (/EADDRINUSE|Is port \d+ in use/.test(output)) resolve('port taken')
      else reject(new Error(`process exited with ${code}:\n${output}`))
    })
  })

/**
 * Starts a server on a port `freePort` found, and on another one when a socket took that port between `freePort`
 * releasing it and the server binding it, as any client socket of a parallel test may. Resolves once it listens.
 */
export const serveOnFreePort = async (start: (port: number) => ChildProcess, timeout: number) => {
  for (let tries = 0; tries < 5; tries++) {
    const port = await freePort()
    const child = start(port)
    if ((await listensOrPortTaken(child, timeout)) === 'listening') return { child, port, base: `http://localhost:${port}` }
  }
  throw new Error('the server found its port taken 5 times in a row')
}

export const stopProcess = async (child: ChildProcess | undefined) => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGKILL')
  await exited
}

/**
 * The ERP's environment against a fresh database of its own, with the ERP's migrations (its tables, empty, and the
 * auth schema) and one admin user. `dispose` drops the database.
 */
export const createErpDatabase = async ({ url, erpDir, base, email, password }: { url: string; erpDir: string; base: string; email: string; password: string }) => {
  const database = `protobase_serve_test_${randomBytes(4).toString('hex')}`
  const admin = postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })
  await admin.unsafe(`create database ${database}`)
  await admin.end()

  const env = {
    DATABASE_URL: withDatabase(url, database),
    BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
    BETTER_AUTH_URL: base,
  }
  const migrated = await run(typescriptArgs('db/migrate.ts'), erpDir, env)
  if (migrated.status !== 0) throw new Error(`migrations failed:\n${migrated.stderr}`)
  // As a new app starts: its organization 1, which the first user then owns.
  const seeded = await run(typescriptArgs('seed/base.ts'), erpDir, env)
  if (seeded.status !== 0) throw new Error(`the base seed failed:\n${seeded.stderr}`)
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

/**
 * The ERP's job at work in a served app: an invoice past its due date sent through the API, whose write hook enqueues
 * the overdue check in the write's transaction, which the worker in the serve process runs. Resolves with the status
 * the invoice ends with.
 */
export const sendPastDueInvoice = async (base: string, token: string, databaseUrl: string) => {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
  const [company] = await sql`insert into crm.companies (organization_id, name, country_code, city) values (1, 'Late Payer', 'NL', 'Utrecht') returning id`
  const [invoice] = await sql`
    insert into sales.invoices (organization_id, number, company_id, issued_at, due_at, subtotal, vat, total)
    values (1, ${`INV-${randomBytes(3).toString('hex')}`}, ${company!.id}, '2020-01-01', '2020-01-31', 0, 0, 0) returning id`
  await sql.end()
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  const record = `${base}/api/v1/invoices/${invoice!.id}`
  const read = await fetch(record, { headers })
  if (read.status !== 200) throw new Error(`reading the invoice answered ${read.status}`)
  const sent = await fetch(record, { method: 'PATCH', headers: { ...headers, 'if-match': read.headers.get('etag')! }, body: JSON.stringify({ status: 'sent' }) })
  if (sent.status !== 200) throw new Error(`sending the invoice answered ${sent.status}: ${await sent.text()}`)
  for (let tries = 0; tries < 100; tries++) {
    const { status } = await (await fetch(record, { headers })).json()
    if (status !== 'sent') return status as string
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return 'sent'
}
