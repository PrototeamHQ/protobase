import path from 'node:path'
import { configExports } from '@protobase/server/config-exports'
import { conventionConfig } from './convention'
import { uiDirs } from './convention-files'
import { importProjectFiles } from './import-project-file'

/**
 * The resources, views and pages of a config folder, as the config module has them by convention: config/index.ts and
 * every config/<dir>/ui.ts. Only those files and what they import run, not protobase.config.ts, which may need secrets.
 */
export const loadDataConfig = async (configDir: string) => {
  const dirs = uiDirs(configDir)
  const [index, ...ui] = await importProjectFiles([path.join(configDir, 'index.ts'), ...dirs.map((dir) => path.join(configDir, dir, 'ui.ts'))])
  const config = conventionConfig(index!, dirs.map((dir, i): [string, Record<string, unknown>] => [dir, ui[i]!]))
  const { resources, views, pages } = configExports(config)
  return {
    models: resources.map((resource) => resource.toModel()),
    views: views.map((view) => view.toModel()),
    pages: pages.map((page) => page.toModel()),
  }
}
