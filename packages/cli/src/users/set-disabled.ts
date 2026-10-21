import { checkAuthSchema, type AdminAuth } from '@protobase/server'
import { setDisabledCommand } from './manage'
import { usersApi } from './users-api'

// `users disable` and `users enable`: on a store the app would start on, so a ban never skips the revocation of MCP
// grants left over in tables the auth no longer knows (`checkAuthSchema`).
export const setDisabledInProject = async (auth: AdminAuth, options: { email: string; disabled: boolean }, out: (text: string) => void) => {
  await checkAuthSchema(auth)
  await setDisabledCommand(usersApi(auth), options, out)
}
