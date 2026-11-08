import pg from 'pg'
import { postgresRelayStore } from '@protobase/server'
import { loadSourceConfig } from '../config/source-config'
import { loadNearestEnvFile } from '../dev/env'
import { openAppDatabase } from '../project/pg-db'

/** The relay store of the project in `projectDir`, over DATABASE_URL; refused when its config has no `pushRelay`. */
export const loadRelayStore = async (projectDir: string) => {
  loadNearestEnvFile(projectDir)
  const config = await loadSourceConfig(projectDir, { command: 'tool' })
  if (!config.pushRelay) throw new Error('The project is no push relay: add pushRelay: { appId } to protobase.config.ts')
  if (!process.env.DATABASE_URL) throw new Error('No database: set DATABASE_URL')
  const database = openAppDatabase(pg, process.env.DATABASE_URL)
  return { store: postgresRelayStore(database.db), close: () => database.db.destroy() }
}
