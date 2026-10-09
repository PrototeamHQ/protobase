import type { TestProject } from 'vitest/node'
import { connectServer, templates, templateState, type TemplateKey } from './templates'

// Clones the project's template into the database its DATABASE_URL names (see `runEnvironment`) and drops it after
// the run. Without a server or a template the database tests skip, as they do without Postgres; CI must have both.
export default async function setup(project: TestProject) {
  const { DATABASE_URL: url, TEST_DATABASE_TEMPLATE: key } = project.config.env
  const template = templates[key as TemplateKey]
  if (!url || !template) throw new Error(`Project ${project.name} needs DATABASE_URL and TEST_DATABASE_TEMPLATE from runEnvironment()`)

  const state = await templateState(template)
  if (state === 'stale') throw new Error(`${template.database} is older than the migrations or seed in ${template.dir}: run pnpm test:db`)
  if (state !== 'ready') {
    if (process.env.CI) throw new Error(`${template.database} is ${state}: CI must run pnpm test:db against a Postgres service first`)
    return
  }

  const database = new URL(url).pathname.slice(1)
  const sql = connectServer()
  await sql.unsafe(`create database "${database}" template "${template.database}" strategy ${template.strategy}`)
  await sql.end()
  return async () => {
    const cleanup = connectServer()
    await cleanup.unsafe(`drop database if exists "${database}" with (force)`)
    await cleanup.end()
  }
}
