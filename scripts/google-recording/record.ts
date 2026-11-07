// Records Gmail's and Google's token answers from the test account: `bun run record:google`, by hand only, with
// TEST_GOOGLE_CLIENT_ID_SECRET (the OAuth client's id), TEST_GOOGLE_CLIENT_SECRET and TEST_GOOGLE_REFRESH_TOKEN set.
// It prints the files it wrote and, on a failure, the call and its status alone.
import { recordGoogle, type GoogleCredentials } from './google-calls'
import { writeRecordings } from './write'

/** The credentials from `env`; throws naming the variables that are missing. */
export const credentialsFrom = (env: Record<string, string | undefined>): GoogleCredentials => {
  const names = { clientId: 'TEST_GOOGLE_CLIENT_ID_SECRET', clientSecret: 'TEST_GOOGLE_CLIENT_SECRET', refreshToken: 'TEST_GOOGLE_REFRESH_TOKEN' } as const
  const missing = Object.values(names).filter((name) => !env[name])
  if (missing.length > 0) throw new Error(`Set ${missing.join(', ')} to record Google's answers`)
  return { clientId: env[names.clientId]!, clientSecret: env[names.clientSecret]!, refreshToken: env[names.refreshToken]! }
}

if (import.meta.main) {
  const files = writeRecordings(await recordGoogle(fetch, credentialsFrom(process.env)))
  for (const file of files) console.log(`wrote ${file}`)
}
