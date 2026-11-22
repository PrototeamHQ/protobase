import { randomBytes } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { latestSteps, offlineStepsMigration, settingsStoreNames } from '@protobase/server/internal'
import { runPreconditions } from '../../src/migration/snapshot/preconditions'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { withDatabase } from '../support/serve-process'

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const maintenance = () => postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })

const databases: string[] = []
const createDatabase = async (setup: string) => {
  const name = `protobase_preconditions_${randomBytes(4).toString('hex')}`
  const sql = maintenance()
  await sql.unsafe(`create database ${name}`)
  await sql.end()
  databases.push(name)
  const db = postgres(withDatabase(url, name), { max: 1, onnotice: () => {} })
  await db.unsafe(setup)
  await db.end()
  return withDatabase(url, name)
}

afterAll(async () => {
  if (!reachable) return
  const sql = maintenance()
  for (const name of databases) await sql.unsafe(`drop database if exists ${name} with (force)`)
  await sql.end()
})

// The checks of the steps after a snapshot whose auth module is at its first step: the account keys' among them.
const names = settingsStoreNames({})
const checks = offlineStepsMigration(names, { ...latestSteps(names.names.modules), auth: 1 })!.checks

describe.skipIf(!reachable)('the preconditions of the steps a migration writes', () => {
  it("refuse when the database's rows break what a step assumes, and pass when they do not", async () => {
    const twice = await createDatabase(`create schema auth;
      create table auth.account (id text primary key, provider_id text not null, account_id text not null);
      insert into auth.account values ('a', 'github', '1'), ('b', 'github', '1')`)
    await expect(runPreconditions(twice, checks)).rejects.toThrow('The auth store has more than one account for a provider and account id: github 1 (accounts a, b)')
    const once = await createDatabase(`create schema auth;
      create table auth.account (id text primary key, provider_id text not null, account_id text not null);
      insert into auth.account values ('a', 'github', '1'), ('b', 'github', '2')`)
    await expect(runPreconditions(once, checks)).resolves.toBeUndefined()
  })

  it("say to apply the project's migrations first when the database lacks the store's tables", async () => {
    await expect(runPreconditions(await createDatabase('select 1'), checks)).rejects.toThrow("The database lacks a table of the auth store that the snapshot has: apply the project's migrations to it first")
  })
})
