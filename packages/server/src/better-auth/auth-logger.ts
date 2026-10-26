import { createLogger, type BetterAuthOptions } from 'better-auth'

// Better Auth reports a store it cannot check, or one that lacks its tables, when it starts, with the advice to run
// `npx auth migrate`, which changes the database outside the project's migrations. Protobase checks the store itself
// before it serves (`checkAuthSchema`) and names the command that writes the migration, so these reports are left out;
// a request to a store that is behind still fails.
const schemaReports = [/^Database schema mismatch/, /^Could not validate the database schema/]

const output = createLogger()

/** Better Auth's logger, without its reports on the store's schema. */
export const authLogger: NonNullable<BetterAuthOptions['logger']> = {
  log: (level, message, ...args) => {
    if (schemaReports.some((report) => report.test(message))) return
    output[level](message, ...args)
  },
}
