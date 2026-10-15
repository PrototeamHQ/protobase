import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

/** The folders of a config folder that hold a ui.ts, whose views the convention adds to config/index.ts's, in name order. */
export const uiDirs = (configDir: string) =>
  readdirSync(configDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(configDir, entry.name, 'ui.ts')))
    .map((entry) => entry.name)
    .sort()
