import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { authOf, cleanProjects, migrate, migrationsOf, newProject } from '../migration/snapshot/project-fixture'
import { snapshotFile } from '../migration/snapshot/snapshot-file'
import { importState, type ImportManifest } from './import-state'
import { runLoadPhase } from './load-phase'

afterEach(cleanProjects)

it('refuses a snapshot the auth migration would refuse before it loads any data', async () => {
  const projectDir = await newProject()
  await migrate(projectDir, authOf())
  await rm(path.join(projectDir, snapshotFile))
  await writeFile(path.join(migrationsOf(projectDir), '002_supabase_schema.sql'), 'select 1;\n')
  const state = importState(projectDir)
  await mkdir(path.dirname(state.data), { recursive: true })
  await state.writeManifest({ migration: '002_supabase_schema.sql' } as ImportManifest)
  await writeFile(state.data, 'select 1;\n')
  const options = { targetUrl: 'postgres://localhost:1/none', projectDir, migrationsDir: migrationsOf(projectDir), configDir: path.join(projectDir, 'config') }
  await expect(runLoadPhase(options, () => {})).rejects.toThrow(`001_auth.sql was written by \`protobase migration\`, and the project has no ${snapshotFile}`)
})
