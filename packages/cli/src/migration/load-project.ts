import { loadSourceConfig } from '../config/source-config'
import { withDevUrl } from '../config/tool-url'
import { loadNearestEnvFile } from '../dev/env'
import type { Extension } from '../project/extensions'

/**
 * The config of the project in `dir` as `protobase dev` merges it: protobase.config.ts, with the convention's resources
 * when it names none, after the configs of `extensions` and the configs it extends, with the `.env` nearest it read,
 * and the project's dev address when it sets no `url` (`withDevUrl`).
 */
export const loadMigrationConfig = async (dir: string, extensions: Extension[] = []) => {
  loadNearestEnvFile(dir)
  return withDevUrl(await loadSourceConfig(dir, { command: 'tool', extensions }), dir)
}
