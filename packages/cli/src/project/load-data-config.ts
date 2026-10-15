import path from 'node:path'
import { configExports } from '@protobase/server'
import { conventionConfig } from './convention'
import { uiDirs } from './convention-files'
import { importProjectCode } from './import-project-file'

/**
 * The resources, views and pages of a config folder, as the config module has them by convention: config/index.ts and
 * every config/<dir>/ui.ts. Only those files and what they import run, not protobase.config.ts, which may need secrets.
 */
export const loadDataConfig = async (configDir: string) => {
  const dirs = uiDirs(configDir)
  const code = [
    `import * as index from ${JSON.stringify(path.join(configDir, 'index.ts'))}`,
    ...dirs.map((dir, i) => `import * as ui${i} from ${JSON.stringify(path.join(configDir, dir, 'ui.ts'))}`),
    'export { index }',
    `export const ui = [${dirs.map((dir, i) => `[${JSON.stringify(dir)}, ui${i}]`).join(', ')}]`,
    '',
  ].join('\n')
  const loaded = await importProjectCode(path.join(configDir, 'protobase-data-config.js'), code)
  const config = conventionConfig(loaded.index as Record<string, unknown>, loaded.ui as Array<[string, Record<string, unknown>]>)
  const { resources, views, pages } = configExports(config)
  return {
    models: resources.map((resource) => resource.toModel()),
    views: views.map((view) => view.toModel()),
    pages: pages.map((page) => page.toModel()),
  }
}
