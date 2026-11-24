import { organizationsInput } from '@protobase/server/internal'
import { loadSourceConfig } from '../config/source-config'
import { loadNearestEnvFile } from '../dev/env'

/**
 * The default organization and the role of the users there already, as the config of the project in `projectDir` gives
 * them: it keeps them while organizations are off, when the project's sign-in has no organizations to read them from.
 */
export const loadConfigOrganizations = async (projectDir: string) => {
  loadNearestEnvFile(projectDir)
  const config = await loadSourceConfig(projectDir, { command: 'tool' })
  return config.auth ? organizationsInput(config.auth.organizations) : undefined
}
