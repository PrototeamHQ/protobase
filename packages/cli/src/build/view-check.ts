import { existsSync } from 'node:fs'
import path from 'node:path'
import type { PageModel } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'
import { checkViewQueries } from '@protobase/server'
import { loadDataConfig } from '../project/load-data-config'

/**
 * Fails the build, instead of a page once it asks, when a view filters, counts, sorts or searches by a field that its
 * resource does not mark for it. It loads the config folder once in Node, config/index.ts and config/<dir>/ui.ts with
 * what they import; protobase.config.ts does not run, so the build still needs no secrets and no database. Returns the
 * folder's pages and resources, which the build reads too.
 */
export const checkViews = async (projectDir: string): Promise<{ pages: PageModel[]; models: ResourceModel[] }> => {
  const configDir = path.join(projectDir, 'config')
  if (!existsSync(path.join(configDir, 'index.ts'))) return { pages: [], models: [] }
  const { models, views, pages } = await loadDataConfig(configDir, projectDir)
  checkViewQueries(models, views)
  return { pages, models }
}
