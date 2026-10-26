import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exportOrder } from './export-order'

describe('exportOrder', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-export-order-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  const write = async (files: Record<string, string>) => {
    for (const [file, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true })
      await writeFile(path.join(dir, file), content)
    }
  }

  it('lists the exports in source order, through relative export * and past types and packages', async () => {
    await write({
      'index.ts': [
        `export { vehicles } from './vehicles/data'`,
        `export * from './jobs.js'`,
        `export * as reports from './reports'`,
        `export * from '@acme/shared'`,
        `export type { Vehicle } from './vehicles/data'`,
        `export const customers = {}, invoices = {}`,
        `export function helper() {}`,
        `export { vehicles as fleet }`,
      ].join('\n'),
      'vehicles/data.ts': `export const vehicles = {}\nexport type Vehicle = {}\n`,
      'jobs.ts': `export const serviceJobs = {}\nexport default {}\nexport { serviceJobs as vehicles }\n`,
      'reports/index.ts': `export const a = 1\n`,
    })
    expect(exportOrder(path.join(dir, 'index.ts'))).toEqual(['vehicles', 'serviceJobs', 'reports', 'customers', 'invoices', 'helper', 'fleet'])
  })
})
