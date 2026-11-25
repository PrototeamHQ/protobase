import { checkMigrationRecord, type AdminAuth } from '@protobase/server'
import { plainStoreDb, runtimeModel, type ModuleTargets } from '@protobase/server/internal'
import type { PinOptions } from '../organizations/pin'
import { setDisabledCommand } from './manage'
import { usersApi } from './users-api'
import { protobaseVersion } from '../version/version'

// `users disable` and `users enable`: on a database the app would start on (`checkMigrationRecord`), with the schema
// modules its config needs, so a ban finds every table as this version of Protobase expects it.
export const setDisabledInProject = async (auth: AdminAuth, modules: ModuleTargets, options: PinOptions & { email: string; disabled: boolean }, out: (text: string) => void) => {
  await checkMigrationRecord(plainStoreDb(auth), runtimeModel(auth, modules), protobaseVersion)
  await setDisabledCommand(usersApi(auth), options, out)
}
