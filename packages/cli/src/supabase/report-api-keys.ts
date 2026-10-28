import { apiKeyVariables } from '@protobase/server'

/** What the app needs before supabase-js's clients reach `/api/sb`, in the words of the Supabase client API reference. */
export const apiKeysSection = () =>
  `## API keys

The app serves supabase-js's \`/api/sb/rest/v1\`, \`/api/sb/realtime/v1\` and \`/api/sb/storage/v1\` only with API keys, and admits calls to \`/api/sb/functions/v1\` by them. The keys are \`apiKeys\` in \`protobase.config.ts\`, \`{ publishable_key, secret_key }\`, or else \`${apiKeyVariables.publishable_key}\` and \`${apiKeyVariables.secret_key}\` in the app's environment. Without either, or with \`apiKeys: false\`, the app serves none of them. The publishable key takes the place of the Supabase project's anon or publishable key and is safe in a browser; the secret key takes the place of its service_role or secret key and stays on servers.

Then point each client at the app's \`/api/sb\` with the publishable key, in place of the project's URL and anon key:

\`\`\`ts
const supabase = createClient('https://<the app's origin>/api/sb', '<the publishable key>')
\`\`\`
`
