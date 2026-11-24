import { checkMigrationRecord, type AdminAuth } from '@protobase/server'
import { setDisabledCommand } from './manage'
import { usersApi } from './users-api'
import { protobaseVersion } from '../version/version'

// `users disable` and `users enable`: on a store the app would start on (`checkMigrationRecord`), so a ban finds every
// table as this version of Protobase expects it.
export const setDisabledInProject = async (auth: AdminAuth, options: { email: string; disabled: boolean }, out: (text: string) => void) => {
  await checkMigrationRecord(auth, protobaseVersion)
  await setDisabledCommand(usersApi(auth), options, out)
}
