import { existsSync } from 'node:fs'
import path from 'node:path'
import { adminAppMain } from '../project/admin-app'

/** Fails, naming them, when the admin app in `appDir` lacks the files `protobase dev` serves it from. */
export const requireAppFiles = (appDir: string) => {
  const missing = ['index.html', adminAppMain].filter((file) => !existsSync(path.join(appDir, file)))
  if (missing.length > 0) {
    throw new Error(`The admin app is missing ${missing.join(', ')} in ${appDir}; \`protobase dev\` serves the app from there`)
  }
}
