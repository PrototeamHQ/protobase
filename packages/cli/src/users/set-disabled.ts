import { checkAuthSchema, type AdminAuth } from '@protobase/server'
import { setDisabledCommand } from './manage'
import { usersApi } from './users-api'

// `users disable` and `users enable`: on a store the app would start on (`checkAuthSchema`), so a ban finds every
// table as this version of Protobase expects it.
export const setDisabledInProject = async (auth: AdminAuth, options: { email: string; disabled: boolean }, out: (text: string) => void) => {
  await checkAuthSchema(auth)
  await setDisabledCommand(usersApi(auth), options, out)
}
